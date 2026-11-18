import {describe,expect,it} from 'vitest';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ClamAvUnixSocketScanner} from './clamav-media-scanner.js';

const sample=Buffer.from('minimal-binary-media-testing-payload-123456789');
async function withClamd(reply:string,action:(socketPath:string)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'r2d-clamd-'));
 const socketPath=join(dir,'s.sock');
 const server=createServer(socket=>{
  const parts:Buffer[]=[];
  socket.on('data',chunk=>{
   parts.push(Buffer.from(chunk));
   const combined=Buffer.concat(parts);
   if(combined.length<20||!combined.subarray(0,10).equals(Buffer.from('zINSTREAM\0')))
    return;
   if(combined.subarray(-4).equals(Buffer.alloc(4)))socket.write(reply+'\0');
  });
 });
 try{
  await new Promise<void>((resolve,reject)=>server.listen(socketPath,()=>resolve()).once('error',reject));
  await action(socketPath);
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await rm(dir,{force:true,recursive:true});
 }
}
describe('R2D ClamAV strict host scanner',()=>{
 it('accepts only an actual INSTREAM clean response',async()=>{
  await withClamd('stream: OK',async socketPath=>{
   const result=await new ClamAvUnixSocketScanner(socketPath,'clamav_test',3000).scan(sample);
   expect(result).toEqual({status:'CLEAN',scannerId:'clamav_test'});
  });
 });
 it('rejects malware or ambiguous daemon responses',async()=>{
  await withClamd('stream: Eicar-Test-Signature FOUND',async socketPath=>{
   await expect(new ClamAvUnixSocketScanner(socketPath).scan(sample))
    .rejects.toThrow('failed closed');
  });
  await withClamd('stream: UNKNOWN',async socketPath=>{
   await expect(new ClamAvUnixSocketScanner(socketPath).scan(sample))
    .rejects.toThrow('failed closed');
  });
 });
 it('refuses unavailable scanner, relative socket paths and invalid payloads',async()=>{
  expect(()=>new ClamAvUnixSocketScanner('tcp://localhost:3310')).toThrow();
  expect(()=>new ClamAvUnixSocketScanner('/tmp/../run/clamd')).toThrow();
  await expect(new ClamAvUnixSocketScanner('/tmp/absent-clamd-test.socket',undefined,1000)
   .scan(sample)).rejects.toThrow();
  await expect(new ClamAvUnixSocketScanner('/tmp/absent-clamd-test.socket',undefined,1000)
   .scan(new Uint8Array())).rejects.toThrow('size');
 });
});
