import {createHash} from 'node:crypto';
import {AnthropicMessagesAdapter,BoundedModelGateway,
 GeminiGenerateContentAdapter,OpenAIResponsesAdapter,type ModelRequest}
 from '@medsol/agent-runtime';
import {
 assertTrialProvider,assertTrialScenario,buildTrialWireRequest,
 buildTrialReadbackRequest,parseTrialSocialWrite,parseTrialSocialReadback,
 parseTrialSendgridAccepted,parseTrialJsonRpc,safeTrialWireSummary,
 TRIAL_FAKE_TOKEN,TRIAL_LINKEDIN_ORG,TRIAL_LINKEDIN_POST,
 TRIAL_META_PAGE,TRIAL_META_POST,TRIAL_SENDGRID_MESSAGE,TRIAL_TEXT,
 type TrialProvider,type TrialScenario,type TrialWireResponse,
 type TrialWireRequest
} from './provider-trial-wire.js';

/** No socket, HTTP client, fetch or SDK egress in this harness. */
export type ProviderTrialResult={
 trialRef:string;provider:TrialProvider;scenario:TrialScenario;
 fixtureOnly:true;contractOutcome:'FIXTURE_MATCH'|'HTTP_ACCEPTED_UNVERIFIED'|
  'BLOCKED'|'OUTCOME_UNKNOWN'|'CONTRACT_REJECTED';
 fixtureReadbackMatches:boolean;mockHttpExchanges:number;
 mockCallbacks:number;mockDeduplicatedCallbacks:number;
 wire:ReturnType<typeof safeTrialWireSummary>|null;
 actualProviderRequests:0;actualEmailsSent:0;actualPostsPublished:0;
 actualModelCalls:0;actualMcpCalls:0;actualA2aCalls:0;
 verifiedRemoteReceipts:0;accountOwnershipVerified:false;
 appEntitlementVerified:false;senderDomainVerified:false;
 externalEffectsAuthorized:false;automaticRetryAllowed:false;
 limitation:string;
};
const LIMITATION='IN_PROCESS_FIXTURE_ONLY: no provider credentials, real network, '+
 'real customer account, authorized remote dispatch, delivery receipt or AI inference';
const isModel=(p:TrialProvider):p is 'OPENAI'|'ANTHROPIC'|'GEMINI'=>
 p==='OPENAI'||p==='ANTHROPIC'||p==='GEMINI';
const isSocial=(p:TrialProvider):p is 'META_GRAPH'|'LINKEDIN'=>
 p==='META_GRAPH'||p==='LINKEDIN';
function responseFor(provider:TrialProvider,scenario:TrialScenario):
 TrialWireResponse|null{
 if(scenario==='TIMEOUT_BEFORE_ACK'||scenario==='TIMEOUT_AFTER_ACCEPT')
  return null;
 if(scenario==='AUTH_REJECTED')return{status:401,headers:{},body:{error:'invalid_token'}};
 if(scenario==='SCOPE_REJECTED')return{status:403,headers:{},body:{error:'insufficient_scope'}};
 if(scenario==='RATE_LIMITED')return{status:429,headers:{'retry-after':'60'},body:{error:'rate_limited'}};
 if(scenario==='SERVER_ERROR')return{status:503,headers:{},body:{error:'unavailable'}};
 if(scenario==='MALFORMED_RESPONSE')return{status:200,headers:{},body:{unexpected:'garbage'}};
 if(provider==='META_GRAPH')return{status:200,headers:{},
  body:{id:scenario==='ACCOUNT_MISMATCH'?'9999999999_1234567890':TRIAL_META_POST}};
 if(provider==='LINKEDIN')return{status:201,headers:{
  'x-restli-id':scenario==='ACCOUNT_MISMATCH'?
   'not-a-valid-urn':TRIAL_LINKEDIN_POST},body:null};
 if(provider==='SENDGRID')return{status:202,
  headers:{'x-message-id':TRIAL_SENDGRID_MESSAGE},body:null};
 if(provider==='MCP')return{status:200,headers:{},
  body:{jsonrpc:'2.0',id:'trial-initialize',result:{
   protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},
   serverInfo:{name:'in-process-fixture',version:'1.0.0'}}}};
 if(provider==='A2A')return{status:200,headers:{},
  body:{jsonrpc:'2.0',id:'trial-message',
   result:{id:'trial-task',status:{state:'submitted'}}}};
 throw new Error('Model response fixtures are handled by canonical model adapters');
}
function trialReadback(provider:'META_GRAPH'|'LINKEDIN',
 scenario:TrialScenario,ref:string):TrialWireResponse{
 if(provider==='META_GRAPH')return{status:200,headers:{},
  body:{id:ref,from:{id:scenario==='READBACK_MISMATCH'?
   '9999999999':TRIAL_META_PAGE},
   message:scenario==='READBACK_MISMATCH'?'TAMPERED':TRIAL_TEXT}};
 return{status:200,headers:{},body:{id:ref,
  author:scenario==='READBACK_MISMATCH'?'urn:li:organization:999999':
   TRIAL_LINKEDIN_ORG,
  commentary:scenario==='READBACK_MISMATCH'?'TAMPERED':TRIAL_TEXT}};
}
function modelFixture(provider:'OPENAI'|'ANTHROPIC'|'GEMINI',
 scenario:TrialScenario):Response{
 if(scenario==='AUTH_REJECTED')return Response.json({error:'invalid_key'},{status:401});
 if(scenario==='SCOPE_REJECTED')return Response.json({error:'not_allowed'},{status:403});
 if(scenario==='RATE_LIMITED')return Response.json({error:'rate_limited'},{status:429});
 if(scenario==='SERVER_ERROR')return Response.json({error:'provider_error'},{status:503});
 if(scenario==='MALFORMED_RESPONSE')return new Response('{"invalid"',{
  status:200,headers:{'content-type':'application/json'}});
 if(provider==='OPENAI')return Response.json({status:'completed',
  output_text:'DRAFT: offline fixture only',usage:{input_tokens:10,output_tokens:12}});
 if(provider==='ANTHROPIC')return Response.json({type:'message',role:'assistant',
  stop_reason:'end_turn',content:[{type:'text',text:'DRAFT: offline fixture only'}],
  usage:{input_tokens:10,output_tokens:12}});
 return Response.json({candidates:[{finishReason:'STOP',
  content:{role:'model',parts:[{text:'DRAFT: offline fixture only'}]}}],
  usageMetadata:{promptTokenCount:10,candidatesTokenCount:12}});
}
function validateCapturedModelWire(provider:'OPENAI'|'ANTHROPIC'|'GEMINI',
 request:TrialWireRequest){
 const expected=provider==='OPENAI'?'https://api.openai.com/v1/responses':
  provider==='ANTHROPIC'?'https://api.anthropic.com/v1/messages':
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
 if(request.url!==expected||request.method!=='POST')
  throw new Error('Model adapter attempted an unexpected endpoint');
 const body=request.body;
 if(!body)throw new Error('Missing model request body');
 if(provider==='OPENAI'){
  if(body.store!==false||body.background!==false||
   body.parallel_tool_calls!==false||!Array.isArray(body.tools)||
   body.tools.length!==0||body.model!=='gpt-4.1-mini')
   throw new Error('OpenAI tool/storage safeguards absent');
 }else if(provider==='ANTHROPIC'){
  if(body.model!=='claude-sonnet-4-5'||body.tools!==undefined||
   !Array.isArray(body.messages))
   throw new Error('Anthropic tool-free Messages contract invalid');
 }else{
  if(!Array.isArray(body.tools)||body.tools.length!==0||
   !Array.isArray(body.contents)||!body.systemInstruction)
   throw new Error('Gemini tool-free generateContent contract invalid');
 }
 if(request.headers['authorization']&&
  !request.headers['authorization'].includes(TRIAL_FAKE_TOKEN))
  throw new Error('Unexpected model credential');
}
async function rehearseModel(provider:'OPENAI'|'ANTHROPIC'|'GEMINI',
 scenario:TrialScenario):Promise<{
 outcome:ProviderTrialResult['contractOutcome'];
 exchanges:number;wire:ProviderTrialResult['wire']
}>{
 if(['ACCOUNT_MISMATCH','READBACK_MISMATCH','DUPLICATE_CALLBACK'].includes(scenario))
  return{outcome:'BLOCKED',exchanges:0,wire:null};
 let captured:TrialWireRequest|null=null;
 let exchanges=0;
 const transport:typeof fetch=async(input,init)=>{
  exchanges++;
  if(exchanges>1)throw new Error('Automatic model retry prohibited');
  const url=typeof input==='string'?input:
   input instanceof URL?input.toString():input.url;
  const headers:Record<string,string>={};
  if(init?.headers&&!(init.headers instanceof Headers)&&
   !Array.isArray(init.headers))Object.assign(headers,init.headers);
  const body=typeof init?.body==='string'?JSON.parse(init.body) as
   Record<string,unknown>:null;
  const request:TrialWireRequest={method:'POST',url,headers,body};
  validateCapturedModelWire(provider,request);
  captured=request;
  if(scenario==='TIMEOUT_BEFORE_ACK'||scenario==='TIMEOUT_AFTER_ACCEPT')
   throw new Error('In-process injected timeout, no real network');
  return modelFixture(provider,scenario);
 };
 const config={apiKey:TRIAL_FAKE_TOKEN,
  model:provider==='OPENAI'?'gpt-4.1-mini':
   provider==='ANTHROPIC'?'claude-sonnet-4-5':'gemini-2.5-flash',
  inputRateMicrosPerMillion:1000000,outputRateMicrosPerMillion:1000000};
 const adapter=provider==='OPENAI'?new OpenAIResponsesAdapter(config,transport):
  provider==='ANTHROPIC'?new AnthropicMessagesAdapter(config,transport):
  new GeminiGenerateContentAdapter(config,transport);
 const request:ModelRequest={organizationId:'offline-trial',
  agentId:'MKT-CMO-001',correlationId:'offline-provider-contract',
  purpose:'INTERNAL_MARKETING_DRAFT',input:TRIAL_TEXT,
  maxOutputTokens:128,timeoutMs:2000,estimatedCostMicros:100000};
 try{
  const result=await new BoundedModelGateway(adapter).complete(request);
  if(!result.text.startsWith('DRAFT: offline fixture'))
   throw new Error('Unexpected model fixture');
  return{outcome:'FIXTURE_MATCH',exchanges,
   wire:captured?safeTrialWireSummary(captured):null};
 }catch{
  return{outcome:scenario==='AUTH_REJECTED'||scenario==='SCOPE_REJECTED'?
   'BLOCKED':scenario==='MALFORMED_RESPONSE'?'CONTRACT_REJECTED':
   'OUTCOME_UNKNOWN',exchanges,
   wire:captured?safeTrialWireSummary(captured):null};
 }
}
export function trialRefFor(input:{organizationId:string;requestKey:string}):string{
 if(!/^[A-Za-z0-9_-]{3,160}$/.test(input.organizationId)||
  !/^[A-Za-z0-9_-]{8,80}$/.test(input.requestKey))
  throw new Error('Tenant-bound offline trial identity and request key required');
 return 'internal:provider-contract-trial/'+createHash('sha256').update(
  JSON.stringify(['medsol-offline-provider-trial-v1',input.organizationId,
   input.requestKey])).digest('hex');
}
export async function runProviderContractTrial(input:{
 organizationId:string;requestKey:string;provider:unknown;scenario:unknown
}):Promise<ProviderTrialResult>{
 const trialRef=trialRefFor(input);
 const provider=assertTrialProvider(input.provider);
 const scenario=assertTrialScenario(input.scenario);
 let outcome:ProviderTrialResult['contractOutcome']='OUTCOME_UNKNOWN';
 let fixtureReadbackMatches=false;
 let mockHttpExchanges=0,mockCallbacks=0,mockDeduplicatedCallbacks=0;
 let wire:ProviderTrialResult['wire']=null;
 if(isModel(provider)){
  const model=await rehearseModel(provider,scenario);
  outcome=model.outcome;mockHttpExchanges=model.exchanges;wire=model.wire;
 }else{
  const request=buildTrialWireRequest(provider);
  wire=safeTrialWireSummary(request);
  mockHttpExchanges=1;
  const response=responseFor(provider,scenario);
  if(response===null)outcome='OUTCOME_UNKNOWN';
  else if(response.status===401||response.status===403||
   response.status===429)outcome='BLOCKED';
  else if(response.status>=500)outcome='OUTCOME_UNKNOWN';
  else if(isSocial(provider)){
   try{
    const ref=parseTrialSocialWrite(provider,response);
    const readRequest=buildTrialReadbackRequest(provider,ref);
    // In-process fixture only. No provider GET or network transport.
    mockHttpExchanges++;
    if(new URL(readRequest.url).hostname==='')
     throw new Error('Invalid fixture GET');
    fixtureReadbackMatches=parseTrialSocialReadback(provider,
     trialReadback(provider,scenario,ref),ref);
    outcome=fixtureReadbackMatches?'FIXTURE_MATCH':'OUTCOME_UNKNOWN';
    if(scenario==='DUPLICATE_CALLBACK'){
     mockCallbacks=2;mockDeduplicatedCallbacks=1;
    }
   }catch{outcome='CONTRACT_REJECTED';}
  }else if(provider==='SENDGRID'){
   outcome=parseTrialSendgridAccepted(response)?
    'HTTP_ACCEPTED_UNVERIFIED':'CONTRACT_REJECTED';
   if(scenario==='DUPLICATE_CALLBACK'){
    mockCallbacks=2;mockDeduplicatedCallbacks=1;
   }
  }else{
   outcome=parseTrialJsonRpc(provider,response)?
    'FIXTURE_MATCH':'CONTRACT_REJECTED';
  }
 }
 return{trialRef,provider,scenario,fixtureOnly:true,
  contractOutcome:outcome,fixtureReadbackMatches,
  mockHttpExchanges,mockCallbacks,mockDeduplicatedCallbacks,
  wire,actualProviderRequests:0,actualEmailsSent:0,
  actualPostsPublished:0,actualModelCalls:0,actualMcpCalls:0,
  actualA2aCalls:0,verifiedRemoteReceipts:0,
  accountOwnershipVerified:false,appEntitlementVerified:false,
  senderDomainVerified:false,externalEffectsAuthorized:false,
  automaticRetryAllowed:false,limitation:LIMITATION};
}
