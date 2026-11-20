/** R3-V ephemeral HTTPS loopback frontend. Never production or live OAuth.
 * Fresh self-signed certificate exists only under the runner temp directory.
 * Real Chromium __Host- Secure cookies remain enforced.
 */
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'medsol-r3v-https-'));
const key=join(directory,'key.pem'),cert=join(directory,'cert.pem');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
 '-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost',
 '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
const server=createHttpsServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
 const forwarded=httpRequest({
  hostname:'127.0.0.1',port:3100,method:req.method,path:req.url,
  headers:{...req.headers,host:'127.0.0.1:3443','x-forwarded-proto':'https'}
 },upstream=>{
  res.writeHead(upstream.statusCode??502,upstream.headers);
  upstream.pipe(res);
 });
 forwarded.on('error',()=>{
  if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});
  res.end(JSON.stringify({error:'Disposable Next server unavailable'}));
 });
 req.pipe(forwarded);
});
server.listen(3443,'127.0.0.1',()=>process.stdout.write('R3-V disposable HTTPS loopback ready\n'));
process.on('SIGTERM',()=>{server.close();rmSync(directory,{recursive:true,force:true})});
