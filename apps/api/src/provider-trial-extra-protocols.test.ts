import {describe,it,expect,vi} from 'vitest';
import {EXTRA_TRIAL_PROVIDERS,EXTRA_FIXTURE_IDS,
 buildExtraTrialFlow,extraTrialFixture,verifyExtraTrialStage,
 rehearseExtraTrial} from './provider-trial-extra-protocols.js';
import {runProviderContractTrial} from './provider-contract-trial.js';
import {TRIAL_PROVIDERS,TRIAL_SCENARIOS,TRIAL_FAKE_TOKEN,
 type TrialWireResponse} from './provider-trial-wire.js';
import {extraTrialOAuthConfig,EXTRA_TRIAL_OAUTH_PROVIDERS,
 ADOBE_TRIAL_AUTH_CONTRACT,buildAdobeTrialTokenRequest,
 parseAdobeTrialToken} from './provider-trial-extra-oauth.js';

const steps={INSTAGRAM:4,TIKTOK:4,YOUTUBE:3,X:6,CANVA:4,
 ADOBE_FIREFLY:2} as const;
describe('Six additional provider-specific offline API contracts',()=>{
 it('exposes all 14 existing and new distinct provider categories',()=>{
  expect(EXTRA_TRIAL_PROVIDERS).toHaveLength(6);
  expect(TRIAL_PROVIDERS).toHaveLength(14);
  expect(new Set(TRIAL_PROVIDERS).size).toBe(14);
  for(const provider of EXTRA_TRIAL_PROVIDERS)
   expect(TRIAL_PROVIDERS).toContain(provider);
 });
 it('runs all six successful sequences to completion, without real calls',async()=>{
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{
   throw new Error('Real fetch must never be called');
  });
  try{
   for(const provider of EXTRA_TRIAL_PROVIDERS){
    const plan=buildExtraTrialFlow(provider);
    expect(plan).toHaveLength(steps[provider]);
    expect(plan[0]?.request.method).toBe('POST');
    expect(plan.every(x=>x.request.url.startsWith('https://'))).toBe(true);
    const direct=rehearseExtraTrial(provider,'SUCCESS');
    expect(direct.outcome).toBe('FIXTURE_MATCH');
    expect(direct.mockHttpExchanges).toBe(steps[provider]);
    expect(direct.fixtureReadbackMatches).toBe(true);
    const result=await runProviderContractTrial({
     organizationId:'offline-tenant',requestKey:'trial-'+provider,
     provider,scenario:'SUCCESS'});
    expect(result).toMatchObject({fixtureOnly:true,
     contractOutcome:'FIXTURE_MATCH',mockHttpExchanges:steps[provider],
     actualProviderRequests:0,actualEmailsSent:0,actualPostsPublished:0,
     actualModelCalls:0,actualMcpCalls:0,actualA2aCalls:0,
     verifiedRemoteReceipts:0,externalEffectsAuthorized:false,
     automaticRetryAllowed:false});
    expect(result.protocolSteps).toHaveLength(steps[provider]);
    expect(JSON.stringify(result)).not.toContain(TRIAL_FAKE_TOKEN);
    expect(JSON.stringify(result)).not.toContain('TRIAL_ONLY_SECRET_NOT_REAL');
   }
   expect(network).not.toHaveBeenCalled();
  }finally{network.mockRestore();}
 });
 it('executes all 66 added offline provider/scenario combinations',async()=>{
  expect(TRIAL_SCENARIOS).toHaveLength(11);
  for(const provider of EXTRA_TRIAL_PROVIDERS){
   for(const scenario of TRIAL_SCENARIOS){
    const trial=await runProviderContractTrial({
     organizationId:'tenant-qa',requestKey:'trial-'+provider+'-'+scenario,
     provider,scenario});
    expect(trial).toMatchObject({provider,scenario,
     actualProviderRequests:0,actualPostsPublished:0,actualEmailsSent:0,
     verifiedRemoteReceipts:0,externalEffectsAuthorized:false,
     automaticRetryAllowed:false,fixtureOnly:true});
    expect(trial.mockHttpExchanges).toBeLessThanOrEqual(steps[provider]);
    if(scenario==='AUTH_REJECTED'||scenario==='SCOPE_REJECTED'||
       scenario==='RATE_LIMITED')
     expect(trial.contractOutcome).toBe('BLOCKED');
    else if(scenario==='TIMEOUT_AFTER_ACCEPT'||scenario==='TIMEOUT_BEFORE_ACK'||
       scenario==='SERVER_ERROR'||scenario==='READBACK_MISMATCH')
     expect(trial.contractOutcome).toBe('OUTCOME_UNKNOWN');
    else if(scenario==='MALFORMED_RESPONSE'||scenario==='ACCOUNT_MISMATCH')
     expect(trial.contractOutcome).toBe('CONTRACT_REJECTED');
    else expect(trial.contractOutcome).toBe('FIXTURE_MATCH');
    if(scenario==='DUPLICATE_CALLBACK'){
     expect(trial.mockCallbacks).toBe(2);
     expect(trial.mockDeduplicatedCallbacks).toBe(1);
    }
   }
  }
 });
 it('stops after the first error and does not proceed with unsafe uploads',()=>{
  for(const provider of EXTRA_TRIAL_PROVIDERS){
   for(const scenario of ['AUTH_REJECTED','SCOPE_REJECTED',
    'RATE_LIMITED','SERVER_ERROR','TIMEOUT_AFTER_ACCEPT',
    'MALFORMED_RESPONSE','ACCOUNT_MISMATCH'] as const){
    const trial=rehearseExtraTrial(provider,scenario);
    expect(trial.mockHttpExchanges).toBe(1);
    expect(trial.fixtureReadbackMatches).toBe(false);
   }
   const late=rehearseExtraTrial(provider,'READBACK_MISMATCH');
   expect(late.mockHttpExchanges).toBe(steps[provider]);
   expect(late.fixtureReadbackMatches).toBe(false);
   expect(late.outcome).toBe('OUTCOME_UNKNOWN');
  }
 });
 it('validates Instagram container status, exact account and caption',()=>{
  const flow=buildExtraTrialFlow('INSTAGRAM');
  expect(flow.map(x=>x.phase)).toEqual([
   'container_create','container_status','media_publish','media_readback']);
  expect(flow[0]?.request.url).toContain('graph.instagram.com/v27.0/');
  expect(flow[0]?.request.body?.image_url).toMatch(/\.invalid\//);
  expect(flow[2]?.request.body?.creation_id)
   .toBe(EXTRA_FIXTURE_IDS.instagramContainer);
  expect(()=>verifyExtraTrialStage('INSTAGRAM','media_readback',{
   status:200,headers:{},body:{id:EXTRA_FIXTURE_IDS.instagramMedia,
    caption:'INJECTED',media_type:'IMAGE'}})).toThrow();
 });
 it('keeps TikTok post private in the fixture and binds chunks/status to publish ID',()=>{
  const flow=buildExtraTrialFlow('TIKTOK');
  expect(flow[0]?.request.url).toContain('creator_info/query');
  expect(flow[1]?.request.body?.post_info).toMatchObject({
   privacy_level:'SELF_ONLY',disable_duet:true,disable_stitch:true,
   disable_comment:true});
  expect(flow[1]?.request.body?.source_info).toMatchObject({
   source:'FILE_UPLOAD',total_chunk_count:1});
  expect(flow[2]?.request).toMatchObject({method:'PUT',
   headers:{'content-type':'video/mp4','content-range':
    'bytes 0-1048575/1048576'}});
  expect(flow[2]?.request.url).toContain('.invalid/');
  expect(flow[3]?.request.body?.publish_id)
   .toBe(EXTRA_FIXTURE_IDS.tiktokPublish);
  const tamper=extraTrialFixture('TIKTOK','publish_status','READBACK_MISMATCH');
  expect(()=>verifyExtraTrialStage('TIKTOK','publish_status',tamper))
   .toThrow('completion');
 });
 it('uses YouTube resumable upload, a fake binary and private processing state',()=>{
  const flow=buildExtraTrialFlow('YOUTUBE');
  expect(flow.map(x=>x.phase)).toEqual([
   'resumable_init','resumable_chunk','processing_status']);
  expect(flow[0]?.request.url).toContain('uploadType=resumable');
  expect(flow[1]?.request.method).toBe('PUT');
  expect(flow[1]?.request.url).toContain('.invalid/');
  expect(flow[2]?.request.url).toContain('processingDetails');
  expect(()=>verifyExtraTrialStage('YOUTUBE','processing_status',{
   status:200,headers:{},body:{items:[{id:EXTRA_FIXTURE_IDS.youtubeVideo,
    processingDetails:{processingStatus:'processing'},
    status:{privacyStatus:'public'}}]}
  })).toThrow();
 });
 it('uses X v2 media init, append, finalize and processing before a text post',()=>{
  const flow=buildExtraTrialFlow('X');
  expect(flow.map(x=>x.phase)).toEqual([
   'media_init','media_append','media_finalize','media_status',
   'create_post','readback_post']);
  expect(flow[0]?.request.url).toContain('/2/media/upload/initialize');
  expect(flow[1]?.request.url).toContain('/append');
  expect(flow[2]?.request.url).toContain('/finalize');
  expect(flow[4]?.request.url).toBe('https://api.x.com/2/tweets');
  expect(flow[4]?.request.body?.media).toEqual({
   media_ids:[EXTRA_FIXTURE_IDS.xMedia]});
 });
 it('keeps Canva editable design and exported rendition as distinct async jobs',()=>{
  const flow=buildExtraTrialFlow('CANVA');
  expect(flow.map(x=>x.phase)).toEqual([
   'autofill_create','autofill_status','export_create','export_status']);
  expect(flow[0]?.request.url).toBe('https://api.canva.com/rest/v1/autofills');
  expect(flow[2]?.request.url).toBe('https://api.canva.com/rest/v1/exports');
  expect(flow[2]?.request.body?.design_id).toBe(EXTRA_FIXTURE_IDS.canvaDesign);
  expect(()=>verifyExtraTrialStage('CANVA','export_status',{
   status:200,headers:{},body:{job:{id:EXTRA_FIXTURE_IDS.canvaExport,
    status:'success',urls:['https://private.evil.invalid/canva']}}
  })).toThrow('offline fixtures');
 });
 it('uses Adobe Firefly server credentials and async status, not Canva OAuth',()=>{
  const flow=buildExtraTrialFlow('ADOBE_FIREFLY');
  expect(flow.map(x=>x.phase)).toEqual(['generate_async','generation_status']);
  expect(flow[0]?.request.url)
   .toBe('https://firefly-api.adobe.io/v3/images/generate-async');
  expect(flow[0]?.request.headers).toHaveProperty('x-api-key');
  expect(flow[1]?.request.url).toContain('/v3/status/urn:ff:jobs:');
  expect(ADOBE_TRIAL_AUTH_CONTRACT.authorizationModel).toBe('OAUTH_SERVER_TO_SERVER');
  expect(buildAdobeTrialTokenRequest()).toMatchObject({
   method:'POST',url:'https://ims-na1.adobelogin.com/ims/token/v3',
   body:{grant_type:'client_credentials'}});
  expect(parseAdobeTrialToken({access_token:TRIAL_FAKE_TOKEN,
   token_type:'bearer',expires_in:3600})).toMatchObject({
   syntheticOnly:true,realProviderCalls:0,storedCredentials:0});
  expect(()=>parseAdobeTrialToken({access_token:'live-secret',
   token_type:'bearer',expires_in:3600})).toThrow();
 });
 it('pins five separate OAuth endpoints and the special TikTok client key dialect',()=>{
  expect(EXTRA_TRIAL_OAUTH_PROVIDERS).toHaveLength(5);
  for(const provider of EXTRA_TRIAL_OAUTH_PROVIDERS){
   const config=extraTrialOAuthConfig(provider);
   expect(new URL(config.authorizationEndpoint).protocol).toBe('https:');
   expect(new URL(config.authorizationEndpoint).hostname)
    .toBe(config.pinnedHostname);
   expect(config.providerKey).toBe(provider);
   expect(config.clientId).toContain('TRIAL_');
   expect(config.redirectUri).toBe('https://marketing.example.org/oauth/callback');
  }
  expect(extraTrialOAuthConfig('TIKTOK')).toMatchObject({
   clientIdQueryParam:'client_key',scopeDelimiter:'COMMA'});
  expect(extraTrialOAuthConfig('INSTAGRAM')).toMatchObject({
   scopeDelimiter:'COMMA'});
  expect(extraTrialOAuthConfig('YOUTUBE').scopes).toContain(
   'https://www.googleapis.com/auth/youtube.upload');
 });
});
