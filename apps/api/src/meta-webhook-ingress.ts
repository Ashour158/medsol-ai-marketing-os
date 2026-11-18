import {createServer,type IncomingMessage,type ServerResponse,type Server} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import type {ProviderWebhookEvidenceService} from './provider-webhook-evidence.service.js';

/**
 * An independently deployed callback boundary, NOT a NestJS marketing route.
 * Request paths map to deployment-approved tenant/connection bindings; neither
 * tenant nor credentials is accepted from request headers, query or body.
 * TLS termination, IP/rate policies and secrets must be operator-managed.
 */
export type MetaCallbackBinding={
 path:string;
 organizationId:string;
 connectionId:string;
 verifyToken:Uint8Array;
};
type IngressSink=Pick<ProviderWebhookEvidenceService,'ingestMeta'>;
const MAX_BYTES=256*1024;
const MAX_QUERY_BYTES=4096;
const pathPattern=/^\/hooks\/meta\/[A-Za-z0-9_-]{32,128}$/;
const idPattern=/^[A-Za-z0-9_-]{1,128}$/;
const challengePattern=/^[A-Za-z0-9_-]{1,256}$/;
function headerValue(req:IncomingMessage,name:string):string|null{
 const entries=req.rawHeaders.reduce((n,part,i)=>n+
  (i%2===0&&part.toLowerCase()===name?1:0),0);
 if(entries!==1)return null;
 const v=req.headers[name];
 return typeof v==='string'?v:null;
}
function equalToken(a:Uint8Array,b:string):boolean{
 const provided=Buffer.from(b,'utf8');
 return a.length===provided.length&&timingSafeEqual(a,provided);
}
function send(res:ServerResponse,status:number,body:string,type='text/plain; charset=utf-8'){
 res.statusCode=status;
 res.setHeader('content-type',type);
 res.setHeader('cache-control','no-store');
 res.setHeader('x-content-type-options','nosniff');
 res.end(body);
}
async function rawPayload(req:IncomingMessage):Promise<Buffer>{
 const contentLength=headerValue(req,'content-length');
 if(contentLength!==null&&(!/^[1-9][0-9]{0,6}$/.test(contentLength)||
    Number(contentLength)>MAX_BYTES))throw new IngressHttpError(413);
 if(req.headers['content-encoding']!==undefined&&
    req.headers['content-encoding']!=='identity')
  throw new IngressHttpError(415);
 const chunks:Buffer[]=[];
 let size=0;
 try{
  for await(const part of req){
   if(!(part instanceof Uint8Array))throw new IngressHttpError(400);
   size+=part.length;
   if(size>MAX_BYTES)throw new IngressHttpError(413);
   chunks.push(Buffer.from(part));
  }
 }catch(e){
  if(e instanceof IngressHttpError)throw e;
  throw new IngressHttpError(400);
 }
 if(size<2)throw new IngressHttpError(400);
 if(contentLength!==null&&size!==Number(contentLength))
  throw new IngressHttpError(400);
 return Buffer.concat(chunks,size);
}
class IngressHttpError extends Error{
 constructor(readonly status:number){super('Callback request not accepted');}
}
export class MetaWebhookIngress {
 private readonly routes:Map<string,MetaCallbackBinding>;
 constructor(bindings:readonly MetaCallbackBinding[],private readonly sink:IngressSink){
  if(!Array.isArray(bindings)||!bindings.length||bindings.length>500||
   !sink||typeof sink.ingestMeta!=='function')
   throw new Error('Deployment-approved callback bindings and ingress sink required');
  this.routes=new Map();
  const pairs=new Set<string>();
  for(const item of bindings){
   if(!item||typeof item.path!=='string'||!pathPattern.test(item.path)||
     !idPattern.test(item.organizationId)||!idPattern.test(item.connectionId)||
     !(item.verifyToken instanceof Uint8Array)||
     item.verifyToken.length<32||item.verifyToken.length>128)
    throw new Error('Invalid provider callback deployment binding');
   const pair=item.organizationId+'|'+item.connectionId;
   if(this.routes.has(item.path)||pairs.has(pair))
    throw new Error('Duplicated Meta callback path or tenant connection');
   pairs.add(pair);
   this.routes.set(item.path,{...item,verifyToken:Buffer.from(item.verifyToken)});
  }
 }
 readonly handle=async(req:IncomingMessage,res:ServerResponse):Promise<void>=>{
  try{
   req.setTimeout(15000,()=>req.destroy());
   const original=req.url??'';
   if(original.length>MAX_QUERY_BYTES||!original.startsWith('/'))
    throw new IngressHttpError(404);
   let url:URL;
   try{url=new URL(original,'http://callback.invalid');}
   catch{throw new IngressHttpError(404);}
   const binding=this.routes.get(url.pathname);
   if(!binding)throw new IngressHttpError(404);
   if(req.method==='GET'){
    const keys=[...url.searchParams.keys()];
    if(keys.length!==3||
       keys.some(k=>!['hub.mode','hub.verify_token','hub.challenge'].includes(k))||
       ['hub.mode','hub.verify_token','hub.challenge'].some(k=>
        url.searchParams.getAll(k).length!==1))
     throw new IngressHttpError(403);
    const mode=url.searchParams.get('hub.mode');
    const token=url.searchParams.get('hub.verify_token')??'';
    const challenge=url.searchParams.get('hub.challenge')??'';
    if(mode!=='subscribe'||!equalToken(binding.verifyToken,token)||
      !challengePattern.test(challenge))
     throw new IngressHttpError(403);
    send(res,200,challenge);
    return;
   }
   if(req.method!=='POST'){
    res.setHeader('allow','GET, POST');
    throw new IngressHttpError(405);
   }
   if(url.search!=='')throw new IngressHttpError(400);
   const type=headerValue(req,'content-type');
   if(!type||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))
    throw new IngressHttpError(415);
   const signature=headerValue(req,'x-hub-signature-256');
   if(!signature)throw new IngressHttpError(403);
   const raw=await rawPayload(req);
   const result=await this.sink.ingestMeta(binding.organizationId,
    'meta_callback_ingress',binding.connectionId,raw,signature);
   send(res,200,JSON.stringify({
    accepted:true,replayed:result.replayed,quarantined:true,
    remoteDeliveryVerified:false,externalEffectsAuthorized:false
   }),'application/json; charset=utf-8');
  }catch(e){
   if(res.headersSent||res.writableEnded)return;
   if(e instanceof IngressHttpError){send(res,e.status,'Callback rejected');return;}
   // Authentication rejects return generic 403. Any database or internal
   // problem remains retryable 503 without revealing provider event material.
   const name=(e as {constructor?:{name?:string}})?.constructor?.name??'';
   if(name==='ForbiddenException'||name==='BadRequestException'){
    send(res,name==='ForbiddenException'?403:400,'Callback rejected');
    return;
   }
   if(name==='NotFoundException'){send(res,404,'Callback rejected');return;}
   send(res,503,'Callback temporarily unavailable');
  }
 };
 createServer():Server{return createServer(this.handle);}
}
