/** R3-V offline-only browser fixture. No network clients, SDKs or provider credentials.
 * It provides deterministic *UI simulation*, never real API permission or
 * PostgreSQL evidence. Those authorities are separately exercised in CI.
 */
import {createServer} from 'node:http';
const identities={
 'r3v-admin-token':{userId:'browser-admin',organizationId:'tenant-a',email:'admin@simulated.invalid',role:'ADMIN'},
 'r3v-viewer-token':{userId:'browser-viewer',organizationId:'tenant-a',email:'viewer@simulated.invalid',role:'VIEWER'},
 'r3v-reviewer-token':{userId:'browser-reviewer',organizationId:'tenant-a',email:'reviewer@simulated.invalid',role:'CMO'}
};
const initial=()=>({
 campaignApproved:false,creativeApproved:false,creativeExists:false,
 brainRuns:[],learningSignals:[],emailSimulations:[],publications:[],
 contacts:[],consent:false,rightsReviewed:false
});
let state=initial();
const json=(res,status,body)=>{
 res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify(body));
};
const read=async req=>{
 let bytes=0,parts=[];
 for await(const chunk of req){
  bytes+=chunk.length;if(bytes>1_500_000)throw new Error('Overlarge fixture request');
  parts.push(chunk);
 }
 const content=Buffer.concat(parts).toString('utf8');
 try{return content?JSON.parse(content):{}}catch{return {}}
};
const jid='campaign-e2e',rid='revision-e2e',aid='approval-e2e';
const preview='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y+ZGWUAAAAASUVORK5CYII=';
function journey(){
 return {
  campaign:{id:jid,name:'Chromium-only scientific campaign',brandId:'brand-e2e',code:'OFFLINE-E2E',status:state.campaignApproved?'APPROVED':'PENDING_APPROVAL'},
  workflow:{id:'workflow-e2e',status:'COMPLETED',currentStep:'AWAIT_HUMAN'},
  campaignApprovals:[{id:aid,decision:state.campaignApproved?'APPROVED':'PENDING',decidedBy:state.campaignApproved?'browser-reviewer':null}],
  brainRuns:state.brainRuns,
  creativeAssets:state.creativeExists?[{
   assetId:'asset-e2e',revisionId:rid,title:'Synthetic raster',
   rightsReviewedAt:state.rightsReviewed?new Date().toISOString():null,
   renditionDigest:'sha256:offline-r3v',
   publicationLinked:state.publications.length>0,
   approvals:[{id:'creative-approval-e2e',decision:state.creativeApproved?'APPROVED':'PENDING'}]
  }]:[],
  publications:state.publications,
  emailSimulations:state.emailSimulations,
  learningSignals:state.learningSignals,
  observations:[],
  stages:{brief:true,agentResearch:state.brainRuns.length>0,campaignApproval:state.campaignApproved,creative:state.creativeExists,publicationSimulation:state.publications.length>0,syntheticEmail:state.emailSimulations.length>0,learningQuarantine:state.learningSignals.length>0},
  auditHistory:[{id:'audit-e2e',action:'OFFLINE_SIMULATION',occurredAt:'2026-11-20T00:00:00Z',objectType:'Campaign'}],
  offlineSimulationOnly:true,externalEffectsAuthorized:false
 };
}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url??'/','http://127.0.0.1:3209');
 if(url.pathname==='/__health')return json(res,200,{status:'synthetic_only'});
 if(url.pathname==='/__reset'&&req.method==='POST'){
  state=initial();return json(res,200,{reset:true});
 }
 if(!url.pathname.startsWith('/marketing/'))return json(res,404,{error:'Unknown endpoint'});
 const token=(req.headers.authorization??'').replace(/^Bearer /,'');
 const actor=identities[token];
 if(!actor)return json(res,401,{message:'Synthetic token not recognized'});
 if(req.headers['x-organization-id']!==actor.organizationId||
    req.headers['x-organization-id']!=='tenant-a')
  return json(res,403,{message:'Cross-tenant access denied by simulated fixture'});
 if(req.headers['x-marketing-session-id']!=='11111111-1111-4111-8111-111111111111')
  return json(res,401,{message:'Synthetic test session required'});
 const path=url.pathname;
 const method=req.method;
 const is=(m,p)=>method===m&&path===p;
 const isManager=actor.role!=='VIEWER';
 const isAdmin=actor.role==='ADMIN';
 if(is('GET','/marketing/me'))return json(res,200,actor);
 if(is('GET','/marketing/overview'))return json(res,200,{campaigns:1,objectives:1,offlineOnly:1});
 if(is('GET','/marketing/agents'))return json(res,200,[]);
 if(is('GET','/marketing/agents/executions'))return json(res,200,[]);
 if(is('GET','/marketing/campaigns'))return json(res,200,[{id:jid,code:'OFFLINE-E2E',name:'Chromium-only scientific campaign',status:'PENDING_APPROVAL',riskLevel:'LOW',updatedAt:new Date().toISOString()}]);
 if(is('GET','/marketing/campaigns/'+jid))return json(res,200,journey().campaign);
 if(is('GET','/marketing/objectives'))return json(res,200,[]);
 if(is('GET','/marketing/products'))return json(res,200,[]);
 if(is('GET','/marketing/workflows'))return json(res,200,[]);
 if(is('GET','/marketing/approvals/pending'))return json(res,200,[]);
 if(is('GET','/marketing/brand/active'))return json(res,200,{version:1});
 if(is('GET','/marketing/tenancy/brands'))return json(res,200,[{id:'brand-e2e',name:'Medsol Offline Scientific Brand'}]);
 if(is('GET','/marketing/journeys/'+jid))return json(res,200,journey());
 if(!isManager && method!=='GET')return json(res,403,{message:'Role denied in browser fixture'});
 let body={};if(method==='POST')try{body=await read(req)}catch{return json(res,413,{message:'Bounded fixture body'})}
 if(is('POST','/marketing/sessions/revoke'))return json(res,200,{revoked:true});
 if(is('POST','/marketing/objectives'))return json(res,200,{id:'objective-e2e',name:body.name});
 if(is('POST','/marketing/workflows'))return json(res,200,{workflowExecutionId:'workflow-e2e',output:{campaign:{campaignId:jid}}});
 if(is('POST','/marketing/brain/runs'))return json(res,200,{id:'brain-e2e',status:'PENDING'});
 if(is('POST','/marketing/brain/runs/brain-e2e/execute')){
  state.brainRuns=[{id:'brain-e2e',status:'COMPLETED',steps:[{stage:'research',agentId:'scientific-research',status:'COMPLETED'}]}];
  return json(res,200,{id:'brain-e2e',status:'COMPLETED'});
 }
 if(is('POST','/marketing/assets/offline-raster')){
  if(!/^iVBORw0KGgo/.test(body.pngBase64??''))
   return json(res,400,{message:'Expected actual offline PNG bytes'});
  state.creativeExists=true;
  return json(res,200,{assetId:'asset-e2e',revisionId:rid,brandId:'brand-e2e',renditionDigest:'sha256:offline-r3v',offlineOnly:true,sourceKind:'FLATTENED_EXPORT'});
 }
 if(is('POST','/marketing/media/evidence/'+rid+'/verify-offline'))
  return json(res,200,{status:'OFFLINE_VERIFIED'});
 if(is('GET','/marketing/assets/revisions/'+rid+'/offline-preview'))
  return json(res,200,{revisionId:rid,editableCopy:'Editable offline source copy',imageDataUrl:preview,renditionDigest:'sha256:offline-r3v',offlineOnly:true});
 if(is('POST','/marketing/assets/revisions/'+rid+'/rights-review')){
  if(actor.userId==='browser-admin')return json(res,403,{message:'Separate reviewer required'});
  state.rightsReviewed=true;return json(res,200,{status:'REVIEWED'});
 }
 if(is('POST','/marketing/integrations')){
  if(!isAdmin)return json(res,403,{message:'Administrator required'});
  return json(res,200,{destinationRef:'internal:connected-destination/offline-e2e'});
 }
 if(is('POST','/marketing/assets/revisions/'+rid+'/submit-approval'))return json(res,200,{approvalId:'creative-approval-e2e'});
 if(is('POST','/marketing/approvals/decide')){
  if(actor.userId!=='browser-reviewer')return json(res,403,{message:'Creator cannot self-approve'});
  if(body.approvalId===aid)state.campaignApproved=true;
  if(body.approvalId==='creative-approval-e2e')state.creativeApproved=true;
  return json(res,200,{decision:'APPROVED'});
 }
 if(is('POST','/marketing/publications')){
  if(!state.creativeApproved)return json(res,403,{message:'Independent approval required'});
  return json(res,200,{publicationId:'publication-e2e'});
 }
 if(is('GET','/marketing/publications/publication-e2e'))return json(res,200,{id:'publication-e2e',version:1});
 if(is('POST','/marketing/publications/publication-e2e/simulate')){
  state.publications=[{id:'publication-e2e',status:'SIMULATED',version:2,attempts:[{id:'attempt-e2e',mode:'SANDBOX',outcome:'SUCCESS'}]}];
  return json(res,200,{status:'SIMULATED'});
 }
 if(is('POST','/marketing/audience/synthetic-contacts')){
  if(!isAdmin)return json(res,403,{message:'Administrator required'});
  state.contacts=[{contactId:'contact-e2e',latestSimulatedConsent:'UNKNOWN'}];
  return json(res,200,{contactId:'contact-e2e'});
 }
 if(is('POST','/marketing/audience/synthetic-contacts/contact-e2e/consent')){
  state.consent=true;state.contacts[0].latestSimulatedConsent='OPTED_IN';
  return json(res,200,{status:'OPTED_IN'});
 }
 if(is('GET','/marketing/audience/synthetic-contacts'))return json(res,200,state.contacts);
 if(is('POST','/marketing/email/simulations')){
  if(!isAdmin||!state.consent)return json(res,403,{message:'Consent required'});
  state.emailSimulations=[{id:'email-e2e',status:'SIMULATED',result:{actualMessagesSent:0}}];
  return json(res,200,{status:'SIMULATED',results:{actualMessagesSent:0}});
 }
 if(is('POST','/marketing/learning/signals')){
  state.learningSignals=[{id:'signal-e2e',status:'QUARANTINED',topic:'offline acceptance'}];
  return json(res,200,{status:'QUARANTINED'});
 }
 return json(res,404,{message:'Unsupported simulated route: '+method+' '+path});
});
server.listen(3209,'127.0.0.1',()=>process.stdout.write('R3-V localhost synthetic API listening\n'));
