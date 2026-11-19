import {describe,expect,it,vi} from 'vitest';
import {runProviderContractTrial,trialRefFor}
 from './provider-contract-trial.js';
import {TRIAL_PROVIDERS,TRIAL_SCENARIOS,
 buildTrialWireRequest,buildTrialReadbackRequest,
 parseTrialSocialWrite,parseTrialSocialReadback,
 parseTrialSendgridAccepted,parseTrialJsonRpc,
 TRIAL_META_PAGE,TRIAL_META_POST,TRIAL_LINKEDIN_ORG,
 TRIAL_LINKEDIN_POST,TRIAL_TEXT,TRIAL_FAKE_TOKEN}
 from './provider-trial-wire.js';
import {isExtraTrialProvider} from './provider-trial-extra-protocols.js';
import {LockedOfficialProviderDispatchGateway}
 from './official-social-publishing.port.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const base={organizationId:'trial-tenant-1',requestKey:'trial-request-001'};
describe('R2/R3 official-provider-shaped offline protocol acceptance',()=>{
 it('builds fixed Meta Page and LinkedIn organization REST wire contracts',()=>{
  const meta=buildTrialWireRequest('META_GRAPH');
  expect(meta).toMatchObject({method:'POST',
   url:'https://graph.facebook.com/v25.0/'+TRIAL_META_PAGE+'/feed',
   body:{message:TRIAL_TEXT}});
  expect(meta.headers.authorization).toContain(TRIAL_FAKE_TOKEN);
  const li=buildTrialWireRequest('LINKEDIN');
  expect(li).toMatchObject({method:'POST',
   url:'https://api.linkedin.com/rest/posts',
   headers:{'Linkedin-Version':'202608',
    'X-Restli-Protocol-Version':'2.0.0'},
   body:{author:TRIAL_LINKEDIN_ORG,commentary:TRIAL_TEXT,
    visibility:'PUBLIC',lifecycleState:'PUBLISHED'}});
  expect(parseTrialSocialWrite('META_GRAPH',{status:200,headers:{},
   body:{id:TRIAL_META_POST}})).toBe(TRIAL_META_POST);
  expect(parseTrialSocialWrite('LINKEDIN',{status:201,
   headers:{'x-restli-id':TRIAL_LINKEDIN_POST},body:null}))
   .toBe(TRIAL_LINKEDIN_POST);
  const metaRead=buildTrialReadbackRequest('META_GRAPH',TRIAL_META_POST);
  expect(metaRead.method).toBe('GET');
  expect(metaRead.url).toContain('fields=id,from,message');
  const liRead=buildTrialReadbackRequest('LINKEDIN',TRIAL_LINKEDIN_POST);
  expect(liRead.method).toBe('GET');
  expect(liRead.url).toContain('urn%3Ali%3Ashare');
  expect(()=>buildTrialReadbackRequest('META_GRAPH','other-page_12345678'))
   .toThrow();
  expect(()=>buildTrialReadbackRequest('LINKEDIN','https://evil.invalid'))
   .toThrow();
 });
 it('rejects malformed remote IDs, wrong accounts and altered readback content',()=>{
  expect(()=>parseTrialSocialWrite('META_GRAPH',{
   status:200,headers:{},body:{id:'99999999_12345678'}})).toThrow();
  expect(()=>parseTrialSocialWrite('LINKEDIN',{
   status:201,headers:{},body:null})).toThrow('x-restli-id');
  expect(parseTrialSocialReadback('META_GRAPH',{status:200,headers:{},
   body:{id:TRIAL_META_POST,from:{id:'wrong'},message:TRIAL_TEXT}},
   TRIAL_META_POST)).toBe(false);
  expect(parseTrialSocialReadback('LINKEDIN',{status:200,headers:{},
   body:{id:TRIAL_LINKEDIN_POST,author:TRIAL_LINKEDIN_ORG,
    commentary:'modified'}},TRIAL_LINKEDIN_POST)).toBe(false);
 });
 it('uses SendGrid Mail Send v3 but treats HTTP 202 as unverified',async()=>{
  const wire=buildTrialWireRequest('SENDGRID');
  expect(wire).toMatchObject({method:'POST',
   url:'https://api.sendgrid.com/v3/mail/send'});
  expect(JSON.stringify(wire.body)).toContain('example.invalid');
  expect(parseTrialSendgridAccepted({status:202,
   headers:{'x-message-id':'trial-message-0001'},body:null})).toBe(true);
  expect(parseTrialSendgridAccepted({status:202,
   headers:{},body:null})).toBe(false);
  const result=await runProviderContractTrial({...base,provider:'SENDGRID',
   scenario:'SUCCESS'});
  expect(result).toMatchObject({contractOutcome:'HTTP_ACCEPTED_UNVERIFIED',
   actualEmailsSent:0,verifiedRemoteReceipts:0,externalEffectsAuthorized:false});
 });
 it('exercises MCP initialize and A2A JSON-RPC wire shapes with zero tools/peers',()=>{
  const mcp=buildTrialWireRequest('MCP');
  const a2a=buildTrialWireRequest('A2A');
  expect(mcp.body).toMatchObject({jsonrpc:'2.0',method:'initialize'});
  expect(a2a.body).toMatchObject({jsonrpc:'2.0',method:'message/send'});
  expect(mcp.url).toContain('.invalid');
  expect(a2a.url).toContain('.invalid');
  expect(parseTrialJsonRpc('MCP',{status:200,headers:{},
   body:{jsonrpc:'2.0',id:'trial-initialize',result:{
    protocolVersion:'2025-06-18',
    serverInfo:{name:'in-process-fixture'}}}})).toBe(true);
  expect(parseTrialJsonRpc('A2A',{status:200,headers:{},
   body:{jsonrpc:'2.0',id:'trial-message',result:{id:'trial-task'}}}))
   .toBe(true);
  expect(parseTrialJsonRpc('A2A',{status:200,headers:{},
   body:{jsonrpc:'2.0',id:'trial-message',error:{code:-1}}})).toBe(false);
 });
 it('runs the real OpenAI/Anthropic/Gemini adapter implementations with fake fetch only',async()=>{
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{
   throw new Error('FORBIDDEN REAL NETWORK');
  });
  try{
   for(const provider of ['OPENAI','ANTHROPIC','GEMINI'] as const){
    const result=await runProviderContractTrial({...base,provider,
     scenario:'SUCCESS'});
    expect(result).toMatchObject({provider,contractOutcome:'FIXTURE_MATCH',
     mockHttpExchanges:1,actualModelCalls:0,
     actualProviderRequests:0,externalEffectsAuthorized:false});
    expect(result.wire?.method).toBe('POST');
    expect(result.wire?.headerNames).toContain('content-type');
    expect(JSON.stringify(result)).not.toContain(TRIAL_FAKE_TOKEN);
   }
   expect(network).not.toHaveBeenCalled();
  }finally{network.mockRestore();}
 });
 it('rehearses every provider/scenario combination without real effects',async()=>{
  for(const provider of TRIAL_PROVIDERS){
   for(const scenario of TRIAL_SCENARIOS){
    const result=await runProviderContractTrial({...base,provider,scenario});
    expect(result).toMatchObject({provider,scenario,fixtureOnly:true,
     actualProviderRequests:0,actualEmailsSent:0,actualPostsPublished:0,
     actualModelCalls:0,actualMcpCalls:0,actualA2aCalls:0,
     verifiedRemoteReceipts:0,accountOwnershipVerified:false,
     appEntitlementVerified:false,senderDomainVerified:false,
     externalEffectsAuthorized:false,automaticRetryAllowed:false});
    expect(result.mockHttpExchanges).toBeLessThanOrEqual(
     isExtraTrialProvider(provider)?6:2);
    expect(JSON.stringify(result)).not.toContain(TRIAL_FAKE_TOKEN);
    expect(JSON.stringify(result)).not.toContain('authorization: Bearer');
    expect(result.trialRef).toMatch(
     /^internal:provider-contract-trial\/[a-f0-9]{64}$/);
    if(scenario==='TIMEOUT_AFTER_ACCEPT')
     expect(result.contractOutcome).toBe('OUTCOME_UNKNOWN');
    if(scenario==='AUTH_REJECTED')
     expect(result.contractOutcome).toBe('BLOCKED');
    if(scenario==='SERVER_ERROR')
     expect(result.contractOutcome).toBe('OUTCOME_UNKNOWN');
   }
  }
 });
 it('never retries an ambiguous social result, nor accepts callback as receipt',async()=>{
  for(const provider of ['META_GRAPH','LINKEDIN'] as const){
   const ambiguous=await runProviderContractTrial({...base,provider,
    scenario:'READBACK_MISMATCH'});
   expect(ambiguous).toMatchObject({contractOutcome:'OUTCOME_UNKNOWN',
    fixtureReadbackMatches:false,automaticRetryAllowed:false,
    verifiedRemoteReceipts:0});
   const duplicate=await runProviderContractTrial({...base,provider,
    scenario:'DUPLICATE_CALLBACK'});
   expect(duplicate).toMatchObject({contractOutcome:'FIXTURE_MATCH',
    mockCallbacks:2,mockDeduplicatedCallbacks:1,
    verifiedRemoteReceipts:0});
   const mismatch=await runProviderContractTrial({...base,provider,
    scenario:'ACCOUNT_MISMATCH'});
   expect(mismatch.contractOutcome).toBe('CONTRACT_REJECTED');
  }
 });
 it('does not permit arbitrary URLs, tokens, provider keys or new execution routes',async()=>{
  await expect(runProviderContractTrial({...base,provider:'http://evil.invalid',
   scenario:'SUCCESS'})).rejects.toThrow('Unsupported');
  await expect(runProviderContractTrial({...base,provider:'META_GRAPH',
   scenario:'PUBLISH_LIVE'})).rejects.toThrow('Unsupported');
  expect(trialRefFor(base)).not.toBe(trialRefFor({
   ...base,organizationId:'another-tenant'}));
  expect(permissionForMarketingRoute('GET',
   '/marketing/integrations/trials/catalog')).toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST',
   '/marketing/integrations/trials/run')).toBe('MANAGE_TENANT');
  for(const path of ['/marketing/integrations/trials/connect',
   '/marketing/integrations/trials/send',
   '/marketing/publications/x/publish','/marketing/email/send',
   '/marketing/tools/execute'])
   expect(()=>permissionForMarketingRoute('POST',path)).toThrow();
  const publisher={publish:vi.fn()} as any;
  await expect(new LockedOfficialProviderDispatchGateway()
   .publish(publisher,{} as any,{} as any)).rejects.toThrow('egress is locked');
  expect(publisher.publish).not.toHaveBeenCalled();
 });
});
