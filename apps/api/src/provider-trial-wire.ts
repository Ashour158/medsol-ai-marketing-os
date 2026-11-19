import {createHash} from 'node:crypto';

/**
 * R2/R3 offline official-HTTP-shape contract fixtures. These builders NEVER
 * issue network requests, and never enter the authoritative publish/email/
 * model/MCP execution path. A URL in this file is a specification, NOT egress.
 * No real tokens, accounts, addresses or permissions are accepted.
 */
export type TrialProvider='META_GRAPH'|'LINKEDIN'|'SENDGRID'|
 'OPENAI'|'ANTHROPIC'|'GEMINI'|'MCP'|'A2A';
export const TRIAL_PROVIDERS:readonly TrialProvider[]=[
 'META_GRAPH','LINKEDIN','SENDGRID','OPENAI','ANTHROPIC','GEMINI','MCP','A2A'
] as const;
export const TRIAL_SCENARIOS=[
 'SUCCESS','AUTH_REJECTED','SCOPE_REJECTED','RATE_LIMITED',
 'SERVER_ERROR','TIMEOUT_BEFORE_ACK','TIMEOUT_AFTER_ACCEPT',
 'MALFORMED_RESPONSE','ACCOUNT_MISMATCH','READBACK_MISMATCH',
 'DUPLICATE_CALLBACK'
] as const;
export type TrialScenario=typeof TRIAL_SCENARIOS[number];
export type TrialWireRequest={
 method:'GET'|'POST';url:string;headers:Record<string,string>;
 body:Record<string,unknown>|null
};
export type TrialWireResponse={
 status:number;headers:Record<string,string>;body:unknown
};
export const TRIAL_TEXT='Synthetic provider protocol rehearsal. No real post, message or email.';
export const TRIAL_FAKE_TOKEN='TRIAL_ONLY_NOT_A_REAL_CREDENTIAL_000000';
export const TRIAL_META_PAGE='123456789012345';
export const TRIAL_META_POST='123456789012345_987654321098765';
export const TRIAL_LINKEDIN_ORG='urn:li:organization:5515715';
export const TRIAL_LINKEDIN_POST='urn:li:share:6844785523593134080';
export const TRIAL_SENDGRID_MESSAGE='trial-only-message-id';
export const TRIAL_META_GRAPH_VERSION='v25.0';
export const TRIAL_LINKEDIN_VERSION='202608';
const bearer={'authorization':'Bearer '+TRIAL_FAKE_TOKEN,
 'content-type':'application/json','accept':'application/json'};
export function assertTrialProvider(raw:unknown):TrialProvider{
 if(typeof raw!=='string'||!TRIAL_PROVIDERS.includes(raw as TrialProvider))
  throw new Error('Unsupported offline trial provider');
 return raw as TrialProvider;
}
export function assertTrialScenario(raw:unknown):TrialScenario{
 if(typeof raw!=='string'||!TRIAL_SCENARIOS.includes(raw as TrialScenario))
  throw new Error('Unsupported offline trial scenario');
 return raw as TrialScenario;
}
export function buildTrialWireRequest(provider:TrialProvider):TrialWireRequest{
 switch(provider){
  case 'META_GRAPH':
   return{method:'POST',
    url:'https://graph.facebook.com/'+TRIAL_META_GRAPH_VERSION+'/'+TRIAL_META_PAGE+'/feed',
    headers:{...bearer},body:{message:TRIAL_TEXT}};
  case 'LINKEDIN':
   return{method:'POST',url:'https://api.linkedin.com/rest/posts',
    headers:{...bearer,'Linkedin-Version':TRIAL_LINKEDIN_VERSION,
     'X-Restli-Protocol-Version':'2.0.0'},
    body:{author:TRIAL_LINKEDIN_ORG,commentary:TRIAL_TEXT,
     visibility:'PUBLIC',distribution:{feedDistribution:'MAIN_FEED',
      targetEntities:[],thirdPartyDistributionChannels:[]},
     lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false}};
  case 'SENDGRID':
   return{method:'POST',url:'https://api.sendgrid.com/v3/mail/send',
    headers:{...bearer},body:{
     personalizations:[{to:[{email:'trial-recipient@example.invalid'}]}],
     from:{email:'trial-sender@example.invalid'},
     subject:'Offline provider contract trial',
     content:[{type:'text/plain',value:TRIAL_TEXT}]}};
  case 'MCP':
   return{method:'POST',url:'https://mcp.example.invalid/mcp',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
    body:{jsonrpc:'2.0',id:'trial-initialize',method:'initialize',
     params:{protocolVersion:'2025-06-18',capabilities:{},
      clientInfo:{name:'medsol-offline-contract-trial',version:'1.0.0'}}}};
  case 'A2A':
   return{method:'POST',url:'https://a2a.example.invalid',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:{jsonrpc:'2.0',id:'trial-message',
     method:'message/send',params:{message:{messageId:'trial-message',
      role:'user',parts:[{text:TRIAL_TEXT}]}}}};
  default:throw new Error('Model providers reuse the canonical model adapters');
 }
}
export function buildTrialReadbackRequest(provider:'META_GRAPH'|'LINKEDIN',
 remotePostRef:string):TrialWireRequest{
 if(provider==='META_GRAPH'){
  if(!/^\d{4,32}_\d{4,32}$/.test(remotePostRef)||
   !remotePostRef.startsWith(TRIAL_META_PAGE+'_'))
   throw new Error('Meta readback reference not bound to trial Page');
  return{method:'GET',
   url:'https://graph.facebook.com/'+TRIAL_META_GRAPH_VERSION+'/'+remotePostRef+
    '?fields=id,from,message',
   headers:{authorization:'Bearer '+TRIAL_FAKE_TOKEN,
    accept:'application/json'},body:null};
 }
 if(!/^urn:li:(share|ugcPost):\d{8,30}$/.test(remotePostRef))
  throw new Error('LinkedIn readback reference malformed');
 return{method:'GET',
  url:'https://api.linkedin.com/rest/posts/'+encodeURIComponent(remotePostRef),
  headers:{authorization:'Bearer '+TRIAL_FAKE_TOKEN,
   'Linkedin-Version':TRIAL_LINKEDIN_VERSION,
   'X-Restli-Protocol-Version':'2.0.0',accept:'application/json'},body:null};
}
function record(raw:unknown):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new Error('Provider fixture response is not a JSON object');
 return raw as Record<string,unknown>;
}
export function parseTrialSocialWrite(provider:'META_GRAPH'|'LINKEDIN',
 response:TrialWireResponse):string{
 if(provider==='META_GRAPH'){
  if(response.status!==200)throw new Error('Meta Graph did not acknowledge create');
  const id=record(response.body).id;
  if(typeof id!=='string'||!/^\d{4,32}_\d{4,32}$/.test(id)||
   !id.startsWith(TRIAL_META_PAGE+'_'))
   throw new Error('Meta Graph returned an unbound or malformed post reference');
  return id;
 }
 if(response.status!==201)
  throw new Error('LinkedIn did not acknowledge create');
 const ref=response.headers['x-restli-id'];
 if(typeof ref!=='string'||!/^urn:li:(share|ugcPost):\d{8,30}$/.test(ref))
  throw new Error('LinkedIn response omitted a valid x-restli-id');
 return ref;
}
export function parseTrialSocialReadback(provider:'META_GRAPH'|'LINKEDIN',
 response:TrialWireResponse,remotePostRef:string):boolean{
 if(response.status!==200)return false;
 try{
  const body=record(response.body);
  if(body.id!==remotePostRef)return false;
  if(provider==='META_GRAPH'){
   const from=record(body.from);
   return from.id===TRIAL_META_PAGE&&body.message===TRIAL_TEXT;
  }
  return body.author===TRIAL_LINKEDIN_ORG&&body.commentary===TRIAL_TEXT;
 }catch{return false;}
}
export function parseTrialSendgridAccepted(response:TrialWireResponse):boolean{
 return response.status===202&&typeof response.headers['x-message-id']==='string'&&
  /^[a-zA-Z0-9_-]{8,120}$/.test(response.headers['x-message-id']);
}
export function parseTrialJsonRpc(provider:'MCP'|'A2A',
 response:TrialWireResponse):boolean{
 if(response.status!==200)return false;
 try{
  const body=record(response.body);
  if(body.jsonrpc!=='2.0'||body.error!==undefined)return false;
  const result=record(body.result);
  if(provider==='MCP'){
   const info=record(result.serverInfo);
   return body.id==='trial-initialize'&&
    typeof result.protocolVersion==='string'&&
    result.protocolVersion==='2025-06-18'&&
    typeof info.name==='string'&&info.name==='in-process-fixture';
  }
  return body.id==='trial-message'&&
   typeof result.id==='string'&&result.id==='trial-task';
 }catch{return false;}
}
export function trialWireDigest(request:TrialWireRequest):string{
 // Hash only nonsecret protocol shape. NEVER log Authorization or model API keys.
 return 'sha256:'+createHash('sha256').update(JSON.stringify([
  'medsol-provider-wire-contract-v1',request.method,request.url,
  Object.keys(request.headers).map(x=>x.toLowerCase()).sort(),request.body
 ])).digest('hex');
}
export function safeTrialWireSummary(request:TrialWireRequest){
 const url=new URL(request.url);
 return{method:request.method,host:url.hostname,path:url.pathname,
  headerNames:Object.keys(request.headers).map(x=>x.toLowerCase()).sort(),
  bodyKeys:request.body?Object.keys(request.body).sort():[],
  wireDigest:trialWireDigest(request)};
}
