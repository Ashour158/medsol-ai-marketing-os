import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {seal,SESSION_COOKIE} from '../src/lib/marketing-auth';
import {randomUUID} from 'node:crypto';

/**
 * R3-Y: Actual Chromium -> TLS Next frontend -> encrypted-cookie BFF ->
 * compiled real Nest controller/guard -> unprivileged FORCE-RLS PostgreSQL.
 * RS256 local synthetic JWKS signs test tokens; production verifier unchanged.
 * Unlike R3-W, no synthetic owner API is used in this suite.
 */
const frontend='https://127.0.0.1:3443';
const api='http://127.0.0.1:3210';
const issuer='http://127.0.0.1:3216';
const org='r3y-tenant-a',brandId='r3y-stage-brand';
type Persona='admin'|'reviewer'|'viewer'|'foreign';
type Access={token:string;sessionId:string;expiresAt:number};
const unique=()=>randomUUID();
async function token(request:APIRequestContext,actor:Persona){
 const r=await request.post(issuer+'/__issue?persona='+actor);
 expect(r.status()).toBe(200);
 const payload=await r.json();
 expect(payload.realEntraIssuerContacted).toBe(false);
 expect(payload.localSyntheticSignedIdentity).toBe(true);
 return String(payload.token);
}
async function session(request:APIRequestContext,actor:Persona):Promise<Access>{
 const jwt=await token(request,actor);
 const expiresAt=Date.now()+9*60_000;
 const response=await request.post(api+'/marketing/sessions',{
  headers:{authorization:'Bearer '+jwt,'x-organization-id':org},
  data:{expiresAt}
 });
 expect(response.status(),await response.text()).toBe(201);
 const value=await response.json();
 expect(value.sessionId).toMatch(/^[a-f0-9-]{36}$/);
 return{token:jwt,sessionId:value.sessionId,expiresAt};
}
async function authenticate(page:Page,request:APIRequestContext,
 actor:Persona='admin'){
 const auth=await session(request,actor);
 const cookie=await seal({accessToken:auth.token,organizationId:org,
  sessionId:auth.sessionId,expiresAt:auth.expiresAt},540);
 await page.context().clearCookies();
 await page.context().addCookies([{name:SESSION_COOKIE,value:cookie,
  url:frontend,httpOnly:true,secure:true,sameSite:'Lax'}]);
 await page.goto('/');
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByText('Signed in as r3y-stage-'+actor+'@example.invalid')).toBeVisible();
 return{...auth,cookie};
}
async function studio(page:Page){
 await page.locator('summary').filter({hasText:'Integrated Campaign Journey'}).click();
 await expect(page.getByRole('heading',{name:/Brief, objective and governed campaign/})).toBeVisible();
}
async function setBrand(page:Page){
 const select=page.getByRole('combobox',{name:'Brand',exact:true});
 await select.selectOption(brandId);
}
async function bff(page:Page,path:string,body?:unknown):Promise<{status:number;result:any}>{
 return page.evaluate(async ({path,body,hasBody})=>{
  const response=await fetch('/api/marketing/'+path,{
   method:hasBody?'POST':'GET',credentials:'same-origin',
   ...(hasBody?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
  });
  const raw=await response.text();let result:unknown;
  try{result=JSON.parse(raw)}catch{result={text:raw}}
  return{status:response.status,result};
 },{path,body,hasBody:body!==undefined});
}
async function assertSuccess(page:Page,path:string,body?:unknown){
 const response=await bff(page,path,body);
 expect(response.status,JSON.stringify(response.result)).toBeGreaterThanOrEqual(200);
 expect(response.status,JSON.stringify(response.result)).toBeLessThan(300);
 return response.result;
}
async function createCampaign(page:Page){
 await setBrand(page);
 await page.getByRole('textbox',{name:'Marketing objective (name)'}).fill('R3-Y science-only '+unique().slice(0,8));
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'Objective created in canonical catalogue'})).toBeVisible();
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created campaign'})).toBeVisible();
 const campaignId=await page.getByRole('textbox',{name:'Tenant campaign ID'}).inputValue();
 expect(campaignId).toMatch(/^[a-zA-Z0-9_-]{12,128}$/);
 return campaignId;
}
async function load(page:Page,id:string){
 await page.getByRole('textbox',{name:'Tenant campaign ID'}).fill(id);
 await page.getByRole('button',{name:'Load durable cross-engine timeline'}).click();
 await expect(page.getByText('Loaded campaign:',{exact:true}).locator('..')).toContainText(id);
}
async function reviewCampaign(page:Page,request:APIRequestContext,id:string){
 await authenticate(page,request,'reviewer');await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'Independent campaign approval recorded'})).toBeVisible();
}
async function creative(page:Page){
 await setBrand(page);
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'Stored actual synthetic PNG'})).toBeVisible();
 await expect(page.getByRole('img',{name:'Generated offline campaign preview; not publishable media'})).toBeVisible();
}

test('T08-007 compiled Nest and real tenant RLS expose the actually approved brand',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const brand=await assertSuccess(page,'brand/active');
 expect(brand).toMatchObject({version:1,status:'APPROVED'});
 const list=await assertSuccess(page,'tenancy/brands');
 expect(list.some((x:any)=>x.id===brandId)).toBe(true);
 await expect(page.getByRole('combobox',{name:'Brand',exact:true})).toContainText('R3Y Real PostgreSQL Scientific Brand');
});
test('T04-012 real Chromium creates an objective and a durable workflow in Nest PostgreSQL',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 const state=await assertSuccess(page,'journeys/'+id);
 expect(state.campaign.id).toBe(id);
 expect(state.workflow.status).toBe('WAITING_APPROVAL');
 expect(state.stages.briefRecorded).toBe(true);
 expect(state.campaignApprovals[0].decision).toBe('PENDING');
 const dossier=await assertSuccess(page,'journeys/'+id+'/dossier');
 expect(dossier).toMatchObject({
  schema:'medsol.customer_delivery_dossier.v1',
  campaign:{id},status:'OFFLINE_EVIDENCE_ONLY',productionStatus:'NOT_CERTIFIED',
  signed:false,externalEffectsAuthorized:false,realProviderDeliveryVerified:false,
  pillars:{social:{realPostsPublished:0},email:{actualMessagesSent:0},
   conversion:{causalAttributionVerified:false},
   commercial:{roiVerified:false}}
 });
 await page.getByRole('button',{name:'Refresh campaign list'}).click();
 await page.getByRole('combobox',{name:'Dossier campaign'}).selectOption(id);
 await page.getByRole('button',{name:'Inspect all six engines'}).click();
 await expect(page.getByRole('status').filter({hasText:'offline gates met'}))
  .toContainText('NOT_CERTIFIED');
 await expect(page.getByRole('link',{name:'Open creative workspace'}).first()).toBeVisible();
 for(const pillar of ['creative','social','email','intelligence','conversion','commercial']){
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export '+pillar+' evidence CSV'}).click();
  const exported=await pending;
  expect(exported.suggestedFilename()).toContain('-'+pillar+'.csv');
 }
});
test('T04-013 new browser page rehydrates a real campaign without recreating owner state',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 const first=await assertSuccess(page,'journeys/'+id);
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await studio(page);await load(page,id);
 const second=await assertSuccess(page,'journeys/'+id);
 expect(second.campaign.id).toBe(first.campaign.id);
 expect(second.workflow.id).toBe(first.workflow.id);
 expect(second.campaignApprovals.length).toBe(first.campaignApprovals.length);
});
test('T03-024 original authenticated creator cannot self-approve a real campaign',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('alert').filter({hasText:/cannot approve|self-approv/i})).toBeVisible();
 const state=await assertSuccess(page,'journeys/'+id);
 expect(state.campaignApprovals[0].decision).toBe('PENDING');
});
test('T05-007 13-agent offline brain uses real Postgres ledger with zero model calls',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 await page.getByRole('button',{name:'Run governed 13-agent offline brain'}).click();
 await expect(page.getByRole('status').filter({hasText:/REVIEW_REQUIRED|COMPLETED/})).toBeVisible();
 const state=await assertSuccess(page,'journeys/'+id);
 expect(state.brainRuns[0].steps.length).toBeGreaterThanOrEqual(13);
 const budget=await assertSuccess(page,'agents/budget');
 expect(budget).toMatchObject({enabled:false});
});
test('T11-005 real Chromium Canvas PNG persists through Nest DAM and hash-verified readback',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 await creative(page);
 const assets=await assertSuccess(page,'assets');
 expect(assets.some((a:any)=>a.brandId===brandId)).toBe(true);
 const preview=page.getByRole('img',{name:'Generated offline campaign preview; not publishable media'});
 await expect(preview).toHaveAttribute('src',/^data:image\/png;base64,/);
 const png=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download verified flattened PNG'}).click();
 expect((await png).suggestedFilename()).toMatch(/^medsol-offline-creative-.+\.png$/);
 const copy=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export editable draft copy (.txt)'}).click();
 expect((await copy).suggestedFilename()).toMatch(/^medsol-offline-creative-.+\.txt$/);
});
test('T11-006 real VIEWER cannot create creative by bypassing disabled browser affordance',async({page,request})=>{
 await authenticate(page,request,'viewer');await studio(page);
 await expect(page.getByRole('button',{name:'Generate and verify internal flattened raster draft'})).toBeDisabled();
 const denied=await bff(page,'assets/offline-raster',{
  brandId,title:'Forged',editableCopy:'Bypass role permission',
  pngBase64:'iVBORw0KGgo',rightsExpiresAt:new Date(Date.now()+86400000).toISOString(),
  requestKey:unique()
 });
 expect(denied.status).toBe(403);
 const auditDenied=await bff(page,'journeys/'+unique()+'/dossier');
 expect(auditDenied.status).toBe(403);
});
test('T09-011 actual publication owner rejects a forged creative approval ID',async({page,request})=>{
 await authenticate(page,request);
 const forbidden=await bff(page,'publications',{
  campaignId:unique(),approvalId:unique(),requestKey:unique()
 });
 expect(forbidden.status).toBeGreaterThanOrEqual(400);
 const pub=await assertSuccess(page,'publications');
 expect(pub).toBeDefined();
});
test('T09-012 complete real maker-checker, rights review and virtual social execution',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 await creative(page);
 await authenticate(page,request,'reviewer');await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Review offline rights as separate reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'rights review recorded'})).toBeVisible();
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'Independent campaign approval recorded'})).toBeVisible();
 await authenticate(page,request);await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Register inert social destination metadata'}).click();
 await expect(page.getByRole('status').filter({hasText:'PENDING_VERIFICATION'})).toBeVisible();
 await page.getByRole('button',{name:'Submit exact offline creative for approval'}).click();
 await expect(page.getByRole('status').filter({hasText:'awaits independent reviewer'})).toBeVisible();
 await authenticate(page,request,'reviewer');await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Approve exact scope as independent reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'exact-scope creative approval recorded'})).toBeVisible();
 await authenticate(page,request);await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Prepare governed publication intent'}).click();
 await expect(page.getByRole('status').filter({hasText:'provider egress permanently blocked'})).toBeVisible();
 await page.getByRole('button',{name:'Execute internal social transport simulation'}).click();
 await expect(page.getByRole('status').filter({hasText:'zero remote requests or posts'})).toBeVisible();
 const state=await assertSuccess(page,'journeys/'+id);
 expect(state.stages.campaignIndependentlyApproved).toBe(true);
 expect(state.stages.creativeIndependentlyApproved).toBe(true);
 expect(state.stages.simulatedSocialPublished).toBe(true);
 expect(state.publications[0].attempts[0].mode).toBe('SANDBOX');
 expect(state.externalEffectsAuthorized).toBe(false);
});
test('T10-010 separate reviewer approves campaign before real synthetic email simulation',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 await reviewCampaign(page,request,id);
 await authenticate(page,request);await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Create synthetic recipient and mock consent'}).click();
 await expect(page.getByRole('status').filter({hasText:'anonymous synthetic recipient'})).toBeVisible();
 await page.getByRole('button',{name:/Simulate consent-gated email/}).click();
 await expect(page.getByRole('status').filter({hasText:'actual messages sent: 0'})).toBeVisible();
 const state=await assertSuccess(page,'journeys/'+id);
 expect(state.stages.syntheticEmailSimulated).toBe(true);
 expect(state.emailSimulations[0].result.actualMessagesSent).toBe(0);
});
test('T10-011 unapproved campaign cannot produce even a synthetic email delivery record',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 const denied=await bff(page,'email/simulations',{
  brandId,campaignId:id,contactIds:[unique()],
  contentDigest:'sha256:'+'f'.repeat(64),requestKey:'mail-'+unique()
 });
 expect(denied.status).toBeGreaterThanOrEqual(400);
 const state=await assertSuccess(page,'journeys/'+id);
 expect(state.emailSimulations).toHaveLength(0);
});
test('T12-004 evidence-learning stays quarantined after real cross-engine HTTP and browser refresh',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 await page.getByRole('button',{name:'Quarantine synthetic learning observation'}).click();
 await expect(page.getByRole('status').filter({hasText:'Feedback quarantined'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await studio(page);await load(page,id);
 const state=await assertSuccess(page,'journeys/'+id);
 expect(state.learningSignals.some((x:any)=>x.status==='QUARANTINED')).toBe(true);
 const proposals=await assertSuccess(page,'learning/proposals');
 expect(proposals.some((x:any)=>x.status==='ACTIVE')).toBe(false);
 const topic='R3Y offline watch '+unique();
 const makeSignal=async(suffix:string)=>assertSuccess(page,'learning/signals',{
  topic,sector:'Synthetic research',sourceUrl:'https://example.invalid/'+unique()+'/'+suffix,
  sourceTitle:'Disposable test reference',observedAt:new Date(Date.now()-1000).toISOString(),
  evidence:{summary:'Offline fixture only, not a real market observation'}
 });
 const a=await makeSignal('first'),b=await makeSignal('second');
 await authenticate(page,request,'reviewer');
 await assertSuccess(page,'learning/verify',{signalId:a.signal.id});
 const market=page.locator('#market-intelligence');
 await market.getByRole('button',{name:'Refresh reviewed market intelligence'}).click();
 await market.getByLabel('Filter research topic').fill(topic);
 await expect(market.getByRole('button',{name:'Capture filtered watch baseline (1)'})).toBeEnabled();
 await market.getByRole('button',{name:'Capture filtered watch baseline (1)'}).click();
 await assertSuccess(page,'learning/verify',{signalId:b.signal.id});
 await market.getByRole('button',{name:'Refresh reviewed market intelligence'}).click();
 await expect(market.getByRole('button',{name:'Compare refreshed reviewed evidence'})).toBeEnabled();
 await market.getByRole('button',{name:'Compare refreshed reviewed evidence'}).click();
 await expect(market.getByRole('status').filter({hasText:'REVIEWED WINDOW CHANGED'})).toBeVisible();
 const csv=page.waitForEvent('download');
 await market.getByRole('button',{name:'Export reviewed watch CSV'}).click();
 expect((await csv).suggestedFilename()).toBe('medsol-reviewed-watch.csv');
});
test('T13-015 actual API quarantine-review KPI never upgrades to causal ROI claims',async({page,request})=>{
 await authenticate(page,request);await studio(page);
 const id=await createCampaign(page);
 const metric=await assertSuccess(page,'performance/ingest',{
  campaignId:id,sourceSystem:'MANUAL_EXPORT',sourceRecordId:'r3y-'+unique(),
  metricKey:'impressions',value:1800,
  observedAt:new Date(Date.now()-120000).toISOString(),
  sourceReference:'internal:r3y-test-only-scientific-observation'
 });
 expect(metric.status).toBe('QUARANTINED');
 const denied=await bff(page,'performance/review',{
  observationId:metric.observationId,
  rationale:'Creator cannot self-review fake marketing observations'
 });
 expect(denied.status).toBe(403);
 await authenticate(page,request,'reviewer');
 const result=await assertSuccess(page,'performance/review',{
  observationId:metric.observationId,
  rationale:'Independent reviewer examined synthetic report evidence'
 });
 expect(result.status).toBe('REVIEWED');
 const summary=await assertSuccess(page,'performance/campaigns/'+id);
 expect(summary.attributionValidated).toBe(false);
 expect(summary.independentlyVerified).toBe(false);
 expect(summary.sourceRecordReconciliation).toMatchObject({
  status:'NO_COMPLETE_MATCHED_GROUPS',matchedGroups:0,incompleteGroups:1,matchedTotals:null
 });
 const local=page.locator('#conversion-lab');
 await expect(local.getByRole('heading',{name:/Conversion & Form Preview/})).toBeVisible();
 await local.getByRole('button',{name:'Rehearse synthetic conversion'}).click();
 await expect(local.getByRole('status')).toContainText('20.00%');
 await expect(local.getByRole('status')).toContainText('Actual leads: 0');
 const csv=page.waitForEvent('download');
 await local.getByRole('button',{name:'Export unsigned conversion CSV'}).click();
 expect((await csv).suggestedFilename()).toBe('medsol-synthetic-conversion-funnel.csv');
 await local.getByRole('button',{name:'Rehearse mock CRM handoff'}).click();
 await expect(local.getByRole('status').filter({hasText:'Handoff rehearsal:'})).toContainText('BLOCKED');
 await local.getByLabel('Virtual consent').selectOption('GRANTED');
 await local.getByLabel('Virtual transport').selectOption('OUTCOME_UNKNOWN');
 await local.getByRole('button',{name:'Rehearse mock CRM handoff'}).click();
 await expect(local.getByRole('status').filter({hasText:'Handoff rehearsal:'})).toContainText('OUTCOME_UNKNOWN');
 const handoffCsv=page.waitForEvent('download');
 await local.getByRole('button',{name:'Export mock handoff CSV'}).click();
 expect((await handoffCsv).suggestedFilename()).toBe('medsol-anonymous-crm-handoff.csv');
});
test('T14-006 real model-owner API rejects paid inference without provisioned budget',async({page,request})=>{
 await authenticate(page,request);
 const budget=await assertSuccess(page,'agents/budget');
 expect(budget).toMatchObject({enabled:false});
 const state=await assertSuccess(page,'agents/operations');
 expect(state).toBeDefined();
});
test('T06-023 live Nest integration registry stores only inert destination metadata',async({page,request})=>{
 await authenticate(page,request);await studio(page);await setBrand(page);
 await page.getByRole('button',{name:'Register inert social destination metadata'}).click();
 await expect(page.getByRole('status').filter({hasText:'PENDING_VERIFICATION'})).toBeVisible();
 const list=await assertSuccess(page,'integrations');
 expect(list.length).toBeGreaterThan(0);
 expect(list.some((x:any)=>x.externalEffectsAuthorized===true)).toBe(false);
});
test('T04-014 signed but unprovisioned foreign user cannot cross the actual Nest tenant boundary',async({request})=>{
 const jwt=await token(request,'foreign');
 const response=await request.post(api+'/marketing/sessions',{
  headers:{authorization:'Bearer '+jwt,'x-organization-id':org},
  data:{expiresAt:Date.now()+600000}
 });
 expect(response.status()).toBe(403);
});
test('T04-015 real OIDC signature validation rejects forged or tampered access tokens',async({request})=>{
 const jwt=await token(request,'admin');
 const changed=jwt.slice(0,-4)+'fake';
 const response=await request.post(api+'/marketing/sessions',{
  headers:{authorization:'Bearer '+changed,'x-organization-id':org},
  data:{expiresAt:Date.now()+600000}
 });
 expect(response.status()).toBe(401);
});
test('T04-016 revoked server session rejects an otherwise valid stolen encrypted browser cookie',async({page,request})=>{
 const auth=await authenticate(page,request);
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 await page.context().addCookies([{name:SESSION_COOKIE,value:auth.cookie,url:frontend,
  httpOnly:true,secure:true,sameSite:'Lax'}]);
 const response=await bff(page,'me');
 expect(response.status).toBe(401);
});
test('T09-013 social review preview cannot bypass read-only human gate or send route',async({page,request})=>{
 await authenticate(page,request);
 const result=await bff(page,'publications/send-now',{externalEffectsAuthorized:true});
 expect(result.status).toBe(404);
 const foreign=await bff(page,'social/discussions/triage-preview',{
  organizationId:'r3y-foreign-tenant',discussionId:'r3y-foreign',
  text:'Mock user question about clinical outcome',status:'OPEN'});
 // Authorization rejects a forged organization scope before payload validation.
 expect(foreign.status).toBe(403);
 const reviewed=await bff(page,'social/discussions/triage-preview',{
  discussionId:'r3y-mock-scientific-001',
  text:'Could you explain whether this is a guaranteed clinical cure?',
  status:'OPEN',moderation:'NORMAL'});
 expect(reviewed.status).toBe(201);
 expect(reviewed.result).toMatchObject({
  discussionId:'r3y-mock-scientific-001',
  disposition:'HUMAN_REVIEW_REQUIRED',
  humanApprovalRequired:true,externalEffectsAuthorized:false
 });
 expect(reviewed.result.escalations).toContain('SCIENTIFIC_REVIEW');
 expect(reviewed.result.escalations).toContain('BRAND_REVIEW');
 const noReply=await bff(page,'social/discussions/reply',{
  discussionId:'r3y-mock-scientific-001',text:'Publish automatically'});
 expect(noReply.status).toBe(404);
 const discussionId='fixture-'+unique();
 await page.locator('summary').filter({hasText:'Campaign-to-Publication Sandbox'}).click();
 const social=page.getByRole('region',{name:'Human-governed social discussion and crisis triage'});
 await social.getByLabel('Synthetic discussion ID').fill(discussionId);
 await social.getByLabel('Sanitized mock discussion text').fill('Could you explain whether this is a guaranteed clinical cure?');
 await social.getByLabel('Community case brand ID').fill(brandId);
 await social.getByRole('button',{name:'Create durable synthetic case'}).click();
 const row=social.locator('article').filter({hasText:discussionId});
 await expect(row).toContainText('HIGH · OPEN');
 await row.getByRole('button',{name:'Claim case'}).click();
 await expect(row).toContainText('Version 2');
 await row.getByRole('button',{name:'Submit internal review'}).click();
 await expect(row).toContainText('PENDING_REVIEW');
 await expect(row.getByRole('button',{name:'Close internally'})).toHaveCount(0);
 await authenticate(page,request,'reviewer');
 await page.locator('summary').filter({hasText:'Campaign-to-Publication Sandbox'}).click();
 await social.getByLabel('Community case brand ID').fill(brandId);
 await social.getByRole('button',{name:'Refresh community case queue'}).click();
 await expect(row).toContainText('PENDING_REVIEW');
 await row.getByRole('button',{name:'Close internally'}).click();
 await expect(row).toContainText('RESOLVED_INTERNAL');
 await row.getByRole('button',{name:'Reopen case'}).click();
 await expect(row).toContainText('Version 5');
 await expect(row).toContainText('Unassigned');
 const forbidden=await bff(page,'social/cases/no-case/reply',{text:'No actual reply'});
 expect(forbidden.status).toBe(404);
});
