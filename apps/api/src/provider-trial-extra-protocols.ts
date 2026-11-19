import {safeTrialWireSummary,TRIAL_FAKE_TOKEN,TRIAL_TEXT,
 type TrialWireRequest,type TrialScenario,type TrialWireResponse}
 from './provider-trial-wire.js';

/**
 * Pure, fixed official-API-shaped protocol sequences for six more platforms.
 * STRICTLY offline: no fetch, SDK, OAuth launch, binary, URL dereference,
 * real account ID, credential, upload, creative generation or post.
 * The fixture state must pass each stage in order before the next stage exists.
 * Creative/asset URLs end in .invalid and can never be dereferenced here.
 */
export const EXTRA_TRIAL_PROVIDERS=[
 'INSTAGRAM','TIKTOK','YOUTUBE','X','CANVA','ADOBE_FIREFLY'
] as const;
export type ExtraTrialProvider=typeof EXTRA_TRIAL_PROVIDERS[number];
export function isExtraTrialProvider(value:unknown):value is ExtraTrialProvider{
 return typeof value==='string'&&
  EXTRA_TRIAL_PROVIDERS.some(p=>p===value);
}
const token='Bearer '+TRIAL_FAKE_TOKEN;
const jsonHeaders={authorization:token,'content-type':'application/json',
 accept:'application/json'};
const videoBytes=1024*1024;
export const EXTRA_FIXTURE_IDS={
 instagramUser:'17841400000000123',
 instagramContainer:'17900000000000001',
 instagramMedia:'18000000000000002',
 tiktokPublish:'v_pub_trial_0123456789',
 youtubeVideo:'dQw4w9WgXcQ',
 xMedia:'1890000000000000001',
 xPost:'1890000000000000002',
 canvaAutofill:'trial-autofill-job-01',
 canvaDesign:'DAVTRIAL001',
 canvaExport:'trial-export-job-01',
 adobeJob:'urn:ff:jobs:trial:12345678-1234-4123-8123-123456789abc'
} as const;
export type ExtraTrialStep={phase:string;request:TrialWireRequest;
 expectedScope:string;effectClass:'PREPARE'|'BINARY_FIXTURE'|'PUBLISH_FIXTURE'|
  'STATUS_READ'|'CREATIVE_EXPORT_FIXTURE'};
const request=(phase:string,method:'GET'|'POST'|'PUT',url:string,
 body:Record<string,unknown>|null,scope:string,
 effectClass:ExtraTrialStep['effectClass'],
 headers:Record<string,string>={...jsonHeaders}):ExtraTrialStep=>({
 phase,request:{method,url,headers,body},expectedScope:scope,effectClass
});
export function buildExtraTrialFlow(provider:ExtraTrialProvider):ExtraTrialStep[]{
 switch(provider){
  case 'INSTAGRAM':{
   const host='https://graph.instagram.com/v27.0/';
   return[
    request('container_create','POST',host+EXTRA_FIXTURE_IDS.instagramUser+
     '/media',{image_url:'https://assets.example.invalid/trial-image.png',
      caption:TRIAL_TEXT},'instagram_business_content_publishing','PREPARE'),
    request('container_status','GET',host+EXTRA_FIXTURE_IDS.instagramContainer+
     '?fields=status_code',null,'instagram_business_content_publishing','STATUS_READ'),
    request('media_publish','POST',host+EXTRA_FIXTURE_IDS.instagramUser+
     '/media_publish',{creation_id:EXTRA_FIXTURE_IDS.instagramContainer},
     'instagram_business_content_publishing','PUBLISH_FIXTURE'),
    request('media_readback','GET',host+EXTRA_FIXTURE_IDS.instagramMedia+
     '?fields=id,caption,media_type',null,
     'instagram_business_basic','STATUS_READ')
   ];
  }
  case 'TIKTOK':{
   const host='https://open.tiktokapis.com/v2/post/publish/';
   return[
    request('creator_info','POST',host+'creator_info/query/',{},
     'video.publish','STATUS_READ'),
    request('video_init','POST',host+'video/init/',{
     post_info:{privacy_level:'SELF_ONLY',title:TRIAL_TEXT,
      disable_duet:true,disable_stitch:true,disable_comment:true,
      brand_content_toggle:false,brand_organic_toggle:true,is_aigc:false},
     source_info:{source:'FILE_UPLOAD',video_size:videoBytes,
      chunk_size:videoBytes,total_chunk_count:1}
    },'video.publish','PREPARE'),
    request('video_upload','PUT',
     'https://upload.example.invalid/tiktok/trial-only-upload',
     {binaryFixtureRef:'internal:media/trial-only-mp4',
      byteCount:videoBytes},'video.publish','BINARY_FIXTURE',{
      'content-type':'video/mp4','content-length':String(videoBytes),
      'content-range':'bytes 0-'+(videoBytes-1)+'/'+videoBytes
     }),
    request('publish_status','POST',host+'status/fetch/',
     {publish_id:EXTRA_FIXTURE_IDS.tiktokPublish},
     'video.publish','STATUS_READ')
   ];
  }
  case 'YOUTUBE':return[
   request('resumable_init','POST',
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {snippet:{title:'Offline trial video',description:TRIAL_TEXT,
      categoryId:'22'},status:{privacyStatus:'private'}},
    'https://www.googleapis.com/auth/youtube.upload','PREPARE',{
     ...jsonHeaders,'x-upload-content-type':'video/mp4',
     'x-upload-content-length':String(videoBytes)}),
   request('resumable_chunk','PUT',
    'https://upload.example.invalid/youtube/trial-session',
    {binaryFixtureRef:'internal:media/trial-only-mp4',byteCount:videoBytes},
    'https://www.googleapis.com/auth/youtube.upload','BINARY_FIXTURE',{
     'content-type':'video/mp4','content-range':'bytes 0-'+(videoBytes-1)+
      '/'+videoBytes}),
   request('processing_status','GET',
    'https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status&id='+
     EXTRA_FIXTURE_IDS.youtubeVideo,null,
    'https://www.googleapis.com/auth/youtube.upload','STATUS_READ')
  ];
  case 'X':{
   const host='https://api.x.com/2/';
   return[
    request('media_init','POST',host+'media/upload/initialize',
     {media_type:'video/mp4',media_category:'tweet_video',
      total_bytes:videoBytes},'media.write','PREPARE'),
    request('media_append','POST',host+'media/upload/'+EXTRA_FIXTURE_IDS.xMedia+
     '/append',{segment_index:0,binaryFixtureRef:'internal:media/trial-only-mp4',
      byteCount:videoBytes},'media.write','BINARY_FIXTURE'),
    request('media_finalize','POST',host+'media/upload/'+EXTRA_FIXTURE_IDS.xMedia+
     '/finalize',{},'media.write','PREPARE'),
    request('media_status','GET',host+'media/upload/'+EXTRA_FIXTURE_IDS.xMedia,
     null,'media.write','STATUS_READ'),
    request('create_post','POST',host+'tweets',{
     text:TRIAL_TEXT,media:{media_ids:[EXTRA_FIXTURE_IDS.xMedia]}},
     'tweet.write','PUBLISH_FIXTURE'),
    request('readback_post','GET',host+'tweets/'+EXTRA_FIXTURE_IDS.xPost+
     '?tweet.fields=author_id,text',null,'tweet.read','STATUS_READ')
   ];
  }
  case 'CANVA':{
   const host='https://api.canva.com/rest/v1/';
   return[
    request('autofill_create','POST',host+'autofills',{
     type:'create_from_brand_template',brand_template_id:'DAGTRIALBRAND001',
     data:{headline:{type:'text',text:TRIAL_TEXT}}},'design:content:write','PREPARE'),
    request('autofill_status','GET',host+'autofills/'+
     EXTRA_FIXTURE_IDS.canvaAutofill,null,'design:meta:read','STATUS_READ'),
    request('export_create','POST',host+'exports',{
     design_id:EXTRA_FIXTURE_IDS.canvaDesign,format:{type:'png'}},
     'design:content:read','CREATIVE_EXPORT_FIXTURE'),
    request('export_status','GET',host+'exports/'+EXTRA_FIXTURE_IDS.canvaExport,
     null,'design:content:read','STATUS_READ')
   ];
  }
  case 'ADOBE_FIREFLY':{
   const host='https://firefly-api.adobe.io/v3/';
   const h={...jsonHeaders,'x-api-key':'TRIAL_ONLY_ADOBE_CLIENT_ID'};
   return[
    request('generate_async','POST',host+'images/generate-async',{
     prompt:'Offline test image, no source generation',contentClass:'art'},
     'firefly_api','PREPARE',h),
    request('generation_status','GET',host+'status/'+
     EXTRA_FIXTURE_IDS.adobeJob,null,'firefly_api','STATUS_READ',h)
   ];
  }
 }
}
type JsonRecord=Record<string,unknown>;
function obj(value:unknown):JsonRecord{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new Error('Provider response object required');
 return value as JsonRecord;
}
const match=(actual:unknown,expected:string|number|boolean,label:string)=>{
 if(actual!==expected)throw new Error(label+' did not match expected fixture binding');
};
const positive=(value:unknown,label:string)=>{
 if(typeof value!=='string'||!value||value.length>160)
  throw new Error('Missing or unsafe '+label);
 return value;
};
/** A strict stage-by-stage response parser; cannot authorize real effects. */
export function verifyExtraTrialStage(provider:ExtraTrialProvider,
 phase:string,response:TrialWireResponse){
 if(response.status<200||response.status>=300)
  throw new Error('Provider fixture HTTP response rejected');
 const body=obj(response.body);
 switch(provider){
  case 'INSTAGRAM':
   if(phase==='container_create')match(body.id,
    EXTRA_FIXTURE_IDS.instagramContainer,'Instagram container');
   else if(phase==='container_status'){
    match(body.id,EXTRA_FIXTURE_IDS.instagramContainer,'Instagram status owner');
    match(body.status_code,'FINISHED','Instagram media processing');
   }else if(phase==='media_publish')
    match(body.id,EXTRA_FIXTURE_IDS.instagramMedia,'Instagram published media');
   else if(phase==='media_readback'){
    match(body.id,EXTRA_FIXTURE_IDS.instagramMedia,'Instagram readback');
    match(body.caption,TRIAL_TEXT,'Instagram caption');
    match(body.media_type,'IMAGE','Instagram media type');
   }else throw new Error('Unknown Instagram protocol stage');
   return;
  case 'TIKTOK':
   if(phase==='creator_info'){
    match(obj(body.error).code,'ok','TikTok creator info');
    const options=obj(body.data).privacy_level_options;
    if(!Array.isArray(options)||!options.includes('SELF_ONLY'))
     throw new Error('TikTok creator privacy choice not allowed');
   }else if(phase==='video_init'){
    match(obj(body.error).code,'ok','TikTok init');
    match(obj(body.data).publish_id,EXTRA_FIXTURE_IDS.tiktokPublish,
     'TikTok publish ID');
    const uploadUrl=positive(obj(body.data).upload_url,'TikTok upload URL');
    match(uploadUrl,'https://upload.example.invalid/tiktok/trial-only-upload',
     'TikTok fake upload URL');
   }else if(phase==='video_upload'){
    if(![200,201,206].includes(response.status))
     throw new Error('TikTok fixture chunk not acknowledged');
    match(body.uploaded_bytes,videoBytes,'TikTok upload bytes');
   }else if(phase==='publish_status'){
    match(obj(body.error).code,'ok','TikTok status');
    match(obj(body.data).status,'PUBLISH_COMPLETE','TikTok completion');
    // TikTok status response carries status and optional public post IDs,
    // not necessarily the original publish_id. It is bound by the request.
   }else throw new Error('Unknown TikTok protocol stage');
   return;
  case 'YOUTUBE':
   if(phase==='resumable_init'){
    if(response.status!==200)
     throw new Error('YouTube resumable session not established');
    match(response.headers.location,
     'https://upload.example.invalid/youtube/trial-session',
     'YouTube fake upload session');
    match(body.resumable,true,'YouTube resumable flag');
   }else if(phase==='resumable_chunk'){
    match(body.id,EXTRA_FIXTURE_IDS.youtubeVideo,'YouTube video ID');
    match(obj(body.status).privacyStatus,'private','YouTube privacy mode');
   }else if(phase==='processing_status'){
    const items=body.items;
    if(!Array.isArray(items)||items.length!==1)
     throw new Error('YouTube processing response requires one item');
    const item=obj(items[0]);
    match(item.id,EXTRA_FIXTURE_IDS.youtubeVideo,'YouTube readback ID');
    match(obj(item.processingDetails).processingStatus,'succeeded',
     'YouTube processing completion');
    match(obj(item.status).privacyStatus,'private','YouTube readback privacy');
   }else throw new Error('Unknown YouTube protocol stage');
   return;
  case 'X':
   if(phase==='media_init')
    match(obj(body.data).id,EXTRA_FIXTURE_IDS.xMedia,'X upload session');
   else if(phase==='media_append'){
    match(body.segment_index,0,'X upload chunk');
    match(body.received_bytes,videoBytes,'X bytes');
   }else if(phase==='media_finalize')
    match(obj(body.data).id,EXTRA_FIXTURE_IDS.xMedia,'X finalize media');
   else if(phase==='media_status'){
    match(obj(body.data).id,EXTRA_FIXTURE_IDS.xMedia,'X media status');
    match(obj(obj(body.data).processing_info).state,'succeeded','X processing');
   }else if(phase==='create_post'){
    match(obj(body.data).id,EXTRA_FIXTURE_IDS.xPost,'X post ID');
    match(obj(body.data).text,TRIAL_TEXT,'X post text');
   }else if(phase==='readback_post'){
    match(obj(body.data).id,EXTRA_FIXTURE_IDS.xPost,'X readback ID');
    match(obj(body.data).text,TRIAL_TEXT,'X readback text');
    match(obj(body.data).author_id,'1890000000000000003','X author binding');
   }else throw new Error('Unknown X stage');
   return;
  case 'CANVA':
   if(phase==='autofill_create')
    match(obj(body.job).id,EXTRA_FIXTURE_IDS.canvaAutofill,
     'Canva autofill job');
   else if(phase==='autofill_status'){
    const job=obj(body.job);
    match(job.id,EXTRA_FIXTURE_IDS.canvaAutofill,'Canva autofill status');
    match(job.status,'success','Canva autofill completion');
    const result=obj(job.result);
    match(result.type,'create_design','Canva autofill result type');
    match(obj(result.design).id,EXTRA_FIXTURE_IDS.canvaDesign,
     'Canva editable design');
   }else if(phase==='export_create')
    match(obj(body.job).id,EXTRA_FIXTURE_IDS.canvaExport,'Canva export job');
   else if(phase==='export_status'){
    const job=obj(body.job);
    match(job.id,EXTRA_FIXTURE_IDS.canvaExport,'Canva export status');
    match(job.status,'success','Canva export completion');
    if(!Array.isArray(job.urls)||job.urls.length!==1||
     job.urls[0]!=='https://assets.example.invalid/canva-trial.png')
     throw new Error('Canva export URLs must be offline fixtures only');
   }else throw new Error('Unknown Canva stage');
   return;
  case 'ADOBE_FIREFLY':
   if(phase==='generate_async'){
    match(body.jobId,EXTRA_FIXTURE_IDS.adobeJob,'Adobe async job ID');
    match(body.statusUrl,'https://firefly-api.adobe.io/v3/status/'+
     EXTRA_FIXTURE_IDS.adobeJob,'Adobe status URL origin');
   }else if(phase==='generation_status'){
    match(body.jobId,EXTRA_FIXTURE_IDS.adobeJob,'Adobe status job ID');
    match(body.status,'succeeded','Adobe generation status');
    const outputs=obj(body.result).outputs;
    if(!Array.isArray(outputs)||outputs.length!==1||
     obj(obj(outputs[0]).image).url!==
      'https://assets.example.invalid/adobe-trial.png')
     throw new Error('Adobe output must be an offline fixture URL');
   }else throw new Error('Unknown Adobe stage');
   return;
 }
}
export function extraTrialFixture(provider:ExtraTrialProvider,phase:string,
 scenario:TrialScenario):TrialWireResponse{
 const error=(status:number)=>({status,headers:{},
  body:{error:{code:status===401?'invalid_token':
   status===403?'insufficient_scope':'rate_limited'}}});
 if(scenario==='AUTH_REJECTED')return error(401);
 if(scenario==='SCOPE_REJECTED')return error(403);
 if(scenario==='RATE_LIMITED')return error(429);
 if(scenario==='SERVER_ERROR')return error(503);
 if(scenario==='MALFORMED_RESPONSE')return{status:200,headers:{},
  body:{unexpected:'malformed'}};
 const mismatch=scenario==='ACCOUNT_MISMATCH',last=
  scenario==='READBACK_MISMATCH';
 let body:JsonRecord={};
 let headers:Record<string,string>={};
 switch(provider){
  case 'INSTAGRAM':
   if(phase==='container_create')body={id:mismatch?'wrong-container':
    EXTRA_FIXTURE_IDS.instagramContainer};
   else if(phase==='container_status')body={id:EXTRA_FIXTURE_IDS.instagramContainer,
    status_code:'FINISHED'};
   else if(phase==='media_publish')body={id:EXTRA_FIXTURE_IDS.instagramMedia};
   else body={id:EXTRA_FIXTURE_IDS.instagramMedia,caption:last?'WRONG':TRIAL_TEXT,
    media_type:'IMAGE'};
   break;
  case 'TIKTOK':
   if(phase==='creator_info')body={error:{code:'ok'},data:{
    privacy_level_options:mismatch?['PUBLIC_TO_EVERYONE']:['SELF_ONLY']}};
   else if(phase==='video_init')body={error:{code:'ok'},data:{
    publish_id:EXTRA_FIXTURE_IDS.tiktokPublish,
    upload_url:'https://upload.example.invalid/tiktok/trial-only-upload'}};
   else if(phase==='video_upload')body={uploaded_bytes:videoBytes};
   else body={error:{code:'ok'},data:{
    status:last?'PROCESSING_UPLOAD':'PUBLISH_COMPLETE'}};
   break;
  case 'YOUTUBE':
   if(phase==='resumable_init'){
    headers={location:mismatch?'https://evil.invalid/upload':
     'https://upload.example.invalid/youtube/trial-session'};
    body={resumable:true};
   }else if(phase==='resumable_chunk')body={id:EXTRA_FIXTURE_IDS.youtubeVideo,
    status:{privacyStatus:'private'}};
   else body={items:[{id:EXTRA_FIXTURE_IDS.youtubeVideo,
    processingDetails:{processingStatus:last?'processing':'succeeded'},
    status:{privacyStatus:'private'}}]};
   break;
  case 'X':
   if(phase==='media_init')body={data:{id:mismatch?'bad-media':
    EXTRA_FIXTURE_IDS.xMedia}};
   else if(phase==='media_append')body={segment_index:0,received_bytes:videoBytes};
   else if(phase==='media_finalize'||phase==='media_status')
    body={data:{id:EXTRA_FIXTURE_IDS.xMedia,
     processing_info:{state:'succeeded'}}};
   else body={data:{id:EXTRA_FIXTURE_IDS.xPost,
    text:last&&phase==='readback_post'?'WRONG':TRIAL_TEXT,
    author_id:'1890000000000000003'}};
   break;
  case 'CANVA':
   if(phase==='autofill_create')body={job:{id:mismatch?'wrong-job':
    EXTRA_FIXTURE_IDS.canvaAutofill,status:'in_progress'}};
   else if(phase==='autofill_status')body={job:{
    id:EXTRA_FIXTURE_IDS.canvaAutofill,status:'success',
    result:{type:'create_design',design:{id:EXTRA_FIXTURE_IDS.canvaDesign}}}};
   else if(phase==='export_create')body={job:{
    id:EXTRA_FIXTURE_IDS.canvaExport,status:'in_progress'}};
   else body={job:{id:EXTRA_FIXTURE_IDS.canvaExport,status:last?'failed':'success',
    urls:['https://assets.example.invalid/canva-trial.png']}};
   break;
  case 'ADOBE_FIREFLY':
   if(phase==='generate_async')body={
    jobId:mismatch?'urn:ff:jobs:bad':EXTRA_FIXTURE_IDS.adobeJob,
    statusUrl:'https://firefly-api.adobe.io/v3/status/'+EXTRA_FIXTURE_IDS.adobeJob};
   else body={jobId:EXTRA_FIXTURE_IDS.adobeJob,
    status:last?'failed':'succeeded',
    result:{outputs:[{image:{url:'https://assets.example.invalid/adobe-trial.png'}}]}};
 }
 return{status:200,headers,body};
}
export type ExtraTrialOutcome='FIXTURE_MATCH'|'BLOCKED'|'OUTCOME_UNKNOWN'|
 'CONTRACT_REJECTED';
export function rehearseExtraTrial(provider:ExtraTrialProvider,
 scenario:TrialScenario){
 const steps=buildExtraTrialFlow(provider);
 const completed:ReturnType<typeof safeTrialWireSummary>[]=[];
 let outcome:ExtraTrialOutcome='FIXTURE_MATCH',readback=false;
 for(const [index,step] of steps.entries()){
  completed.push(safeTrialWireSummary(step.request));
  if(scenario==='TIMEOUT_BEFORE_ACK'||scenario==='TIMEOUT_AFTER_ACCEPT'){
   outcome='OUTCOME_UNKNOWN';break;
  }
  const response=extraTrialFixture(provider,step.phase,
   // Failure classes are injected at first step, except mismatch at the
   // first identity stage or final readback stage.
   scenario==='READBACK_MISMATCH'&&index!==steps.length-1?'SUCCESS':
   scenario==='ACCOUNT_MISMATCH'&&index!==0?'SUCCESS':
   scenario==='DUPLICATE_CALLBACK'?'SUCCESS':scenario);
  if([401,403,429].includes(response.status)){outcome='BLOCKED';break;}
  if(response.status>=500){outcome='OUTCOME_UNKNOWN';break;}
  try{verifyExtraTrialStage(provider,step.phase,response);}
  catch{
   outcome=scenario==='READBACK_MISMATCH'?'OUTCOME_UNKNOWN':
    'CONTRACT_REJECTED';break;
  }
  if(index===steps.length-1)readback=true;
 }
 return{outcome,fixtureReadbackMatches:readback,
  mockHttpExchanges:completed.length,
  mockCallbacks:scenario==='DUPLICATE_CALLBACK'&&outcome==='FIXTURE_MATCH'?2:0,
  mockDeduplicatedCallbacks:scenario==='DUPLICATE_CALLBACK'&&
   outcome==='FIXTURE_MATCH'?1:0,
  wire:completed[0]??null,steps:completed};
}
