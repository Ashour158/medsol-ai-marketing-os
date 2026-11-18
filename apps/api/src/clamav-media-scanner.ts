import {BadRequestException,ConflictException} from '@nestjs/common';
import {createConnection} from 'node:net';
import type {MediaMalwareScanner} from './s3-versioned-media-store.js';

/** Host-managed ClamAV Unix socket. This implementation uses INSTREAM and
 * never marks a file clean on timeout, malware detection or daemon failure.
 * A real clamd process and current signature database must be provisioned
 * and operationally monitored outside this repository.
 */
export class ClamAvUnixSocketScanner implements MediaMalwareScanner {
 readonly scannerId:string;
 constructor(private readonly socketPath:string,scannerId='clamav_clamd',
  private readonly timeoutMs=15000){
  if(!socketPath.startsWith('/')||socketPath.includes('..')||
   !/^\/[a-zA-Z0-9_./-]{4,220}$/.test(socketPath)||
   !/^[A-Za-z0-9_.-]{3,80}$/.test(scannerId)||
   !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)
   throw new BadRequestException('Approved host-local ClamAV socket configuration required');
  this.scannerId=scannerId;
 }
 static fromEnvironment():ClamAvUnixSocketScanner{
  return new ClamAvUnixSocketScanner(process.env.MARKETING_CLAMAV_SOCKET??'');
 }
 async scan(bytes:Uint8Array):Promise<{status:'CLEAN';scannerId:string}>{
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<16||
   bytes.byteLength>24*1024*1024)
   throw new BadRequestException('Malware scan input size invalid');
  return new Promise((resolve,reject)=>{
   const sock=createConnection({path:this.socketPath});
   let complete=false;
   let message='';
   const fail=()=>{
    if(complete)return;
    complete=true;sock.destroy();
    reject(new ConflictException('Media malware scan failed closed'));
   };
   const finish=(success:boolean)=>{
    if(complete)return;
    complete=true;sock.destroy();
    if(success)resolve({status:'CLEAN',scannerId:this.scannerId});
    else reject(new ConflictException('Media malware scan failed closed'));
   };
   sock.setTimeout(this.timeoutMs);
   sock.once('error',fail);
   sock.once('timeout',fail);
   sock.once('close',()=>{if(!complete)fail();});
   sock.on('data',chunk=>{
    message+=chunk.toString('utf8');
    if(message.length>512){fail();return;}
    const terminator=message.indexOf('\0');
    if(terminator>=0)finish(message.slice(0,terminator)==='stream: OK');
   });
   sock.once('connect',()=>{
    try{
     sock.write(Buffer.from('zINSTREAM\0','utf8'));
     for(let pos=0;pos<bytes.length;pos+=64*1024){
      const block=Buffer.from(bytes.subarray(pos,Math.min(pos+64*1024,bytes.length)));
      const len=Buffer.alloc(4);len.writeUInt32BE(block.length);
      sock.write(len);sock.write(block);
     }
     sock.write(Buffer.alloc(4));
    }catch{fail();}
   });
  });
 }
}
