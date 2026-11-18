import {afterEach,describe,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {ForbiddenException} from '@nestjs/common';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {MetaWebhookIngress} from './meta-webhook-ingress.js';
import {verifySignedMetaWebhook} from './meta-signed-webhook-verifier.js';

const path='/hooks/meta/'+ 'a'.repeat(48);
const tenant='tenant-qa';
const connection='connection-qa';
const verifyToken=Buffer.from('managed-meta-subscription-verification-token-1234');
const appSecret=Buffer.from('0123456789abcdef0123456789abcdef');
const event=Buffer.from(JSON.stringify({object:'page',entry:[{id:'page-test'}]}));
const signature=(b:Uint8Array)=>'sha256='+
 createHmac('sha256',appSecret).update(b).digest('hex');

const servers:Server[]=[];
async function setup(){
 const calls:{org:string;conn:string;raw:Buffer}[]=[];
 const ingress=new MetaWebhookIngress([{
  path,organizationId:tenant,connectionId:connection,verifyToken
 }],{
  ingestMeta:async(org:string,actor:string,conn:string,raw:Uint8Array,sign:unknown)=>{
   expect(actor).toBe('meta_callback_ingress');
   verifySignedMetaWebhook(raw,sign,appSecret);
   calls.push({org,conn,raw:Buffer.from(raw)});
   return{observationId:'observation-1',replayed:calls.length>1,
    status:'QUARANTINED' as const,receiptReconciled:false,
    externalEffectsAuthorized:false};
  }
 });
 const server=ingress.createServer();
 servers.push(server);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as AddressInfo).port;
 return{url:'http://127.0.0.1:'+port+path,calls};
}
afterEach(async()=>{
 for(const server of servers.splice(0))
  await new Promise<void>(resolve=>server.close(()=>resolve()));
});
describe('R2E-B deployment-mapped Meta callback HTTP ingress',()=>{
 it('passes only an exact subscription challenge with constant-time token comparison',async()=>{
  const {url,calls}=await setup();
  const search=new URLSearchParams({
   'hub.mode':'subscribe','hub.verify_token':verifyToken.toString(),
   'hub.challenge':'123456789'
  });
  const ok=await fetch(url+'?'+search);
  expect(ok.status).toBe(200);
  expect(await ok.text()).toBe('123456789');
  const bad=new URLSearchParams(search);bad.set('hub.verify_token','incorrect-secret');
  expect((await fetch(url+'?'+bad)).status).toBe(403);
  bad.set('hub.verify_token',verifyToken.toString());
  bad.append('hub.challenge','extra');
  expect((await fetch(url+'?'+bad)).status).toBe(403);
  expect(calls).toHaveLength(0);
 });
 it('routes only signed raw-body notification into correct deployment-bound connection',async()=>{
  const {url,calls}=await setup();
  const headers={'content-type':'application/json','x-hub-signature-256':signature(event),
   'x-organization-id':'spoofed-other-tenant'};
  const response=await fetch(url,{method:'POST',headers,body:event});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   accepted:true,quarantined:true,remoteDeliveryVerified:false,
   externalEffectsAuthorized:false,replayed:false
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({org:tenant,conn:connection,raw:event});
  const again=await fetch(url,{method:'POST',headers,body:event});
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({replayed:true,quarantined:true});
  expect(calls).toHaveLength(2);
 });
 it('rejects tampering, wrong content type, unknown route and unsupported methods',async()=>{
  const {url,calls}=await setup();
  const bad=Buffer.from(event);bad[10]=bad[10]!^1;
  const invalid=await fetch(url,{method:'POST',headers:{
   'content-type':'application/json','x-hub-signature-256':signature(event)
  },body:bad});
  expect(invalid.status).toBe(403);
  expect((await fetch(url,{method:'POST',headers:{
   'content-type':'text/plain','x-hub-signature-256':signature(event)
  },body:event})).status).toBe(415);
  expect((await fetch(url,{method:'POST',headers:{
   'content-type':'application/json'
  },body:event})).status).toBe(403);
  expect((await fetch(url+'?tenant='+tenant,{method:'POST',headers:{
   'content-type':'application/json','x-hub-signature-256':signature(event)
  },body:event})).status).toBe(400);
  expect((await fetch(url.replace(path,'/hooks/meta/'+'x'.repeat(48)))).status).toBe(404);
  expect((await fetch(url,{method:'PUT'})).status).toBe(405);
  expect(calls).toHaveLength(0);
 });
 it('never treats backend ingestion failure as accepted or successful delivery',async()=>{
  const ingress=new MetaWebhookIngress([{
   path,organizationId:tenant,connectionId:connection,verifyToken
  }],{ingestMeta:async()=>{throw new Error('db internal failure involving secret');}});
  const server=ingress.createServer();servers.push(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+(server.address() as AddressInfo).port+path;
  const result=await fetch(url,{method:'POST',headers:{
   'content-type':'application/json','x-hub-signature-256':signature(event)
  },body:event});
  expect(result.status).toBe(503);
  expect(await result.text()).toBe('Callback temporarily unavailable');
 });
 it('refuses ambiguous deployment bindings and malformed paths',()=>{
  const sink={ingestMeta:async()=>({
   observationId:'a',replayed:false,status:'QUARANTINED' as const,
   receiptReconciled:false,externalEffectsAuthorized:false
  })};
  const base={path,organizationId:tenant,connectionId:connection,verifyToken};
  expect(()=>new MetaWebhookIngress([base,base],sink)).toThrow('Duplicated');
  expect(()=>new MetaWebhookIngress([{...base,path:'/hooks/meta/foo'}],sink))
   .toThrow('Invalid');
  expect(()=>new MetaWebhookIngress([{...base,verifyToken:Buffer.from('tiny')}],sink))
   .toThrow('Invalid');
  expect(()=>new MetaWebhookIngress([{...base,organizationId:'../other'}],sink))
   .toThrow('Invalid');
 });
});
