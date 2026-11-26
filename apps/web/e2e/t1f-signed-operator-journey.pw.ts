import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {SESSION_COOKIE} from '../src/lib/marketing-auth';

/**
 * T1F: real, independently logged-in maker/checker browser sessions against
 * compiled Nest, restricted PostgreSQL with FORCE RLS and production Next.
 * Test identity selection exists ONLY in the disposable local OIDC fixture.
 * This is engineering acceptance, not real human IdP UAT or 500-case QA.
 */
const frontend='https://127.0.0.1:3443';
const ctl='http://127.0.0.1:3216';
const brand='r3y-stage-brand';
type Persona='admin'|'reviewer'|'viewer'|'foreign';
const operator=(who:Persona)=>'t1e-stage-'+who+'@example.invalid';
const uid=()=>randomUUID().slice(0,8);
async function signIn(page:Page,who:Persona){
 const pick=await page.request.post(ctl+'/__select-persona?persona='+who);
 expect(pick.status()).toBe(200);
 expect((await pick.json()).disposableCiOnly).toBe(true);
 await page.goto('/api/auth/login');
 await expect(page).toHaveURL(frontend+'/');
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByText('Signed in as '+operator(who))).toBeVisible();
 const me=await api(page,'me');
 expect(me.status).toBe(200);
 expect(me.result.email).toBe(operator(who));
 return me.result;
}
async function switchIdentity(page:Page,who:Persona){
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 return signIn(page,who);
}
async function studio(page:Page){
 await page.locator('summary').filter({hasText:'Integrated Campaign Journey'}).click();
 await expect(page.getByRole('heading',{name:/Brief, objective and governed campaign/})).toBeVisible();
}
async function load(page:Page,id:string){
 await page.getByRole('textbox',{name:'Tenant campaign ID'}).fill(id);
 await page.getByRole('button',{name:'Load durable cross-engine timeline'}).click();
 await expect(page.getByText('Loaded campaign:',{exact:true}).locator('..')).toContainText(id);
}
async function api(page:Page,path:string,body?:unknown):Promise<{status:number;result:any}>{
 return page.evaluate(async({path,body,hasBody})=>{
  const r=await fetch('/api/marketing/'+path,{
   method:hasBody?'POST':'GET',credentials:'same-origin',
   ...(hasBody?{headers:{'content-type':'application/json'},
    body:JSON.stringify(body)}:{})
  });
  const raw=await r.text();let result:unknown;
  try{result=JSON.parse(raw)}catch{result={text:raw}}
  return{status:r.status,result};
 },{path,body,hasBody:body!==undefined});
}
async function success(page:Page,path:string,body?:unknown){
 const r=await api(page,path,body);
 expect(r.status,JSON.stringify(r.result)).toBeGreaterThanOrEqual(200);
 expect(r.status,JSON.stringify(r.result)).toBeLessThan(300);
 return r.result;
}
async function create(page:Page,productId?:string){
 await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption(brand);
 await page.getByRole('textbox',{name:'Marketing objective (name)'})
  .fill('T1F evidence-led biotechnologies '+uid());
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'Objective created in canonical catalogue'}))
  .toBeVisible();
 if(productId)await page.getByRole('combobox',{name:'Product for next campaign (optional)'}).selectOption(productId);
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created campaign'}))
  .toBeVisible();
 const id=await page.getByRole('textbox',{name:'Tenant campaign ID'}).inputValue();
 expect(id).toMatch(/^[a-zA-Z0-9_-]{12,128}$/);
 return id;
}
async function makeCreative(page:Page){
 await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption(brand);
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'Stored actual synthetic PNG'})).toBeVisible();
 await expect(page.getByRole('img',{
  name:'Generated offline campaign preview; not publishable media'}))
  .toHaveAttribute('src',/^data:image\/png;base64,/);
}
async function independentCampaignApproval(page:Page,id:string){
 await switchIdentity(page,'reviewer');
 await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('status').filter({
  hasText:'Independent campaign approval recorded'})).toBeVisible();
}
test('T17-001 two interactive OIDC humans finish real 13-agent, creative, social, email and learning journey',async({page})=>{
 const creator=await signIn(page,'admin');expect(creator.organizationId).toBe('r3y-tenant-a');
 // Exercise actual profile intake and independent review before the campaign.
 const businessName='Alpha proteomics '+uid();
 const knowledge=page.getByRole('region',{name:'R3-H knowledge and learning fabric'});
 const profileForm=knowledge.getByRole('group',{name:'Structured business discovery · manual source'});
 for(const [label,value] of Object.entries({
  'Business name':businessName,'Industry':'Life sciences','Offerings':'Proteomics reagents and instruments',
  'Audience':'Research laboratories','Territories':'Egypt','Differentiators':'Technical training and support'
 }))await profileForm.getByRole('textbox',{name:label,exact:true}).fill(value);
 await profileForm.getByRole('textbox',{name:'Business source HTTPS URL'}).fill('https://example.invalid/alpha-profile');
 await profileForm.getByLabel('Business profile expiry').fill(new Date(Date.now()+30*86400000).toISOString().slice(0,10));
 await profileForm.getByRole('checkbox',{name:/I confirm authorized manual business information/}).check();
 await profileForm.getByRole('checkbox',{name:/Permit the designated brand/}).check();
 await profileForm.getByRole('button',{name:'Submit business profile to quarantine'}).click();
 const profileRow=()=>knowledge.getByRole('row').filter({hasText:'Business profile · '+businessName});
 await expect(profileRow()).toContainText('QUARANTINED');
 const docs=await success(page,'learning/knowledge');
 const doc=docs.find((x:any)=>x.businessProfile?.name===businessName);
 expect(doc).toMatchObject({status:'QUARANTINED',profileAuthoritative:false});
 const lookup={agentId:'MKT-BRAND-001',query:businessName+' proteomics reagents'};
 expect((await success(page,'learning/knowledge/agent-context-preview',lookup)).results.some((x:any)=>x.documentId===doc.id)).toBe(false);
 expect((await api(page,'learning/knowledge/'+doc.id+'/review',{decision:'REVIEW',reason:'Maker may not review own fixture profile'})).status).toBeGreaterThanOrEqual(400);
 await switchIdentity(page,'reviewer');
 await knowledge.getByLabel('Decision or revocation rationale').fill('Independent review of disposable business profile');
 await profileRow().getByRole('button',{name:'Review (other admin)'}).click();
 await expect(profileRow()).toContainText('REVIEWED');
 await switchIdentity(page,'admin');
 expect((await success(page,'learning/knowledge/agent-context-preview',lookup)).results.some((x:any)=>x.documentId===doc.id)).toBe(true);
 expect((await success(page,'learning/knowledge/agent-context-preview',{...lookup,agentId:'MKT-CRM-001'})).results.some((x:any)=>x.documentId===doc.id)).toBe(false);
 expect((await success(page,'tenancy/brands')).some((x:any)=>x.id===brand)).toBe(true);
 expect((await success(page,'brand/active')).status).toBe('APPROVED');
 await studio(page);
 await page.getByRole('textbox',{name:'Campaign brief (reviewed as unverified instructions)'}).fill('Prepare an offline evidence-led proteomics reagents campaign for '+businessName+' research laboratories.');
 const campaignId=await create(page,'r3y-alpha-product');
 expect((await success(page,'journeys/'+campaignId)).campaign.productId).toBe('r3y-alpha-product');
 await page.getByRole('combobox',{name:'Product for next campaign (optional)'}).selectOption('');
 await page.getByRole('button',{name:'Run governed 13-agent offline brain'}).click();
 await expect(page.getByRole('status').filter({hasText:/REVIEW_REQUIRED|COMPLETED/}))
  .toBeVisible();
 await makeCreative(page);
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('alert').filter({hasText:/cannot approve|self-approv/i}))
  .toBeVisible();
 await switchIdentity(page,'reviewer');await studio(page);await load(page,campaignId);
 await page.getByRole('button',{name:'Review offline rights as separate reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'rights review recorded'})).toBeVisible();
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'Independent campaign approval recorded'}))
  .toBeVisible();
 await switchIdentity(page,'admin');await studio(page);await load(page,campaignId);
 await page.getByRole('button',{name:'Register inert social destination metadata'}).click();
 await expect(page.getByRole('status').filter({hasText:'PENDING_VERIFICATION'})).toBeVisible();
 await page.getByRole('button',{name:'Submit exact offline creative for approval'}).click();
 await expect(page.getByRole('status').filter({hasText:'awaits independent reviewer'}))
  .toBeVisible();
 await switchIdentity(page,'reviewer');await studio(page);await load(page,campaignId);
 await page.getByRole('button',{name:'Approve exact scope as independent reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'exact-scope creative approval recorded'}))
  .toBeVisible();
 await switchIdentity(page,'admin');await studio(page);await load(page,campaignId);
 await page.getByRole('button',{name:'Prepare governed publication intent'}).click();
 await expect(page.getByRole('status').filter({hasText:'provider egress permanently blocked'}))
  .toBeVisible();
 await page.getByRole('button',{name:'Execute internal social transport simulation'}).click();
 await expect(page.getByRole('status').filter({hasText:'zero remote requests or posts'}))
  .toBeVisible();
 await page.getByRole('button',{name:'Create synthetic recipient and mock consent'}).click();
 await expect(page.getByRole('status').filter({hasText:'anonymous synthetic recipient'}))
  .toBeVisible();
 await page.getByRole('button',{name:/Simulate consent-gated email/}).click();
 await expect(page.getByRole('status').filter({hasText:'actual messages sent: 0'}))
  .toBeVisible();
 await page.getByRole('button',{name:'Quarantine synthetic learning observation'}).click();
 await expect(page.getByRole('status').filter({hasText:'Feedback quarantined'}))
  .toBeVisible();
 const journey=await success(page,'journeys/'+campaignId);
 expect(journey.stages.campaignIndependentlyApproved).toBe(true);
 expect(journey.stages.creativeIndependentlyApproved).toBe(true);
 expect(journey.stages.simulatedSocialPublished).toBe(true);
 expect(journey.stages.syntheticEmailSimulated).toBe(true);
 expect(journey.brainRuns[0].steps.length).toBeGreaterThanOrEqual(13);
 expect((await success(page,'brain/runs/'+journey.brainRuns[0].id)).input.productId).toBe('r3y-alpha-product');
 expect(journey.publications[0].attempts[0].mode).toBe('SANDBOX');
 expect(journey.emailSimulations[0].result.actualMessagesSent).toBe(0);
 expect(journey.learningSignals.some((x:{status:string})=>x.status==='QUARANTINED')).toBe(true);
 expect(journey.externalEffectsAuthorized).toBe(false);
 expect((await success(page,'agents/budget')).enabled).toBe(false);
 // Cross-module sprint closeout: independently reviewed source evidence must
 // become the tenth *offline* readiness gate, never verified revenue or live ROI.
 const recorded=await success(page,'performance/ingest',{
  campaignId,sourceSystem:'MANUAL_EXPORT',
  sourceRecordId:'t4f-'+uid(),metricKey:'qualified_leads',value:3,
  observedAt:new Date(Date.now()-120000).toISOString(),
  sourceReference:'internal:t4f-disposable-offline-reviewed-metric'
 });
 expect(recorded.status).toBe('QUARANTINED');
 const selfReview=await api(page,'performance/review',{
  observationId:recorded.observationId,
  rationale:'Author cannot independently approve this observation'
 });
 expect(selfReview.status).toBe(403);
 await switchIdentity(page,'reviewer');
 const reviewed=await success(page,'performance/review',{
  observationId:recorded.observationId,
  rationale:'Independent signed reviewer examined disposable local source evidence'
 });
 expect(reviewed).toMatchObject({status:'REVIEWED',independentlyVerified:false});
 await switchIdentity(page,'admin');
 const inspected=await success(page,'journeys/'+campaignId);
 expect(inspected.workflow.status).toBe('COMPLETED');
 expect(inspected.campaign.status).toBe('APPROVED');
 expect(Object.values(inspected.stages).every(x=>x===true)).toBe(true);
 expect(inspected.offlineSimulationOnly).toBe(true);
 expect(inspected.productionCertified).toBe(false);
 expect(inspected.realProvidersConnectedByJourney).toBe(false);
 await page.getByRole('button',{name:'Refresh campaign readiness'}).click();
 const card=page.locator('#readiness-board article').filter({
  hasText:inspected.campaign.name
 }).first();
 await expect(card).toContainText('10/10 offline gates');
 await expect(card).toContainText('SIMULATION COMPLETE');
 const [download]=await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button',{name:'Export unsigned page inspection (JSON)'}).click()
 ]);
 const report=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(report).toMatchObject({
  assertion:'OPERATOR_INSPECTION_ONLY',productionStatus:'NOT_CERTIFIED',
  signed:false,independentlyVerified:false,realProviderExecution:false
 });
 expect(report.items.find((x:{id:string})=>x.id===campaignId))
  .toMatchObject({state:'SIMULATION_COMPLETE',missingGates:[]});
 // Alpha operator must be able to resume a persisted campaign after a refresh
 // without copying IDs, using the already authorized workspace portfolio.
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await studio(page);
 await page.getByRole('combobox',{name:'Choose campaign from workspace portfolio'}).selectOption(campaignId);
 await page.getByRole('button',{name:'Load durable cross-engine timeline'}).click();
 await expect(page.getByText('Loaded campaign:',{exact:true}).locator('..')).toContainText(campaignId);
 await expect(page.getByText('Loaded campaign:',{exact:true}).locator('..')).toContainText('APPROVED');
 await expect(page.getByText(/Loaded campaign product: Synthetic research catalogue product/)).toBeVisible();
});
test('T17-002 signed maker cannot self-approve, and viewer cannot bypass creative permissions',async({page})=>{
 await signIn(page,'admin');await studio(page);
 const id=await create(page);
 const before=await success(page,'journeys/'+id);
 const baselineRevisions=before.creativeAssets.map((x:{revisionId:string})=>x.revisionId).sort();
 expect(before.campaignApprovals[0].decision).toBe('PENDING');
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('alert').filter({hasText:/self-approv|cannot approve/i}))
  .toBeVisible();
 await switchIdentity(page,'viewer');await studio(page);
 const forbidden=await api(page,'assets/offline-raster',{
  brandId:brand,title:'Forged by viewer',editableCopy:'Bypassed disabled UI',
  pngBase64:'iVBORw0KGgo',requestKey:randomUUID(),
  rightsExpiresAt:new Date(Date.now()+86400000).toISOString()
 });
 expect(forbidden.status).toBe(403);
 const deniedAudit=await api(page,'journeys/'+id);
 expect(deniedAudit.status).toBe(403); // VIEWER has no READ_AUDIT authority
 await switchIdentity(page,'admin');await studio(page);await load(page,id);
 const still=await success(page,'journeys/'+id);
 expect(still.campaignApprovals[0].decision).toBe('PENDING');
 expect(still.creativeAssets.map((x:{revisionId:string})=>x.revisionId).sort())
  .toEqual(baselineRevisions); // denied viewer mutation changed no canonical revision
});
test('T17-003 signed foreign tenant cannot read or mutate another organization campaign',async({page})=>{
 await signIn(page,'admin');await studio(page);
 const id=await create(page);
 const foreign=await switchIdentity(page,'foreign');
 expect(foreign.organizationId).toBe('r3y-tenant-b');
 const list=await success(page,'tenancy/brands');
 expect(list.some((x:{id:string})=>x.id===brand)).toBe(false);
 const journey=await api(page,'journeys/'+id);
 expect(journey.status).toBeGreaterThanOrEqual(400);
 const forged=await api(page,'requests',{
  organizationId:'r3y-tenant-a',
  requestedOutcome:'Attacker uses a signed foreign tenant token for an A campaign'
 });
 expect(forged.status).toBe(403);
 const crossHeader=await api(page,'approvals/decide',{
  organizationId:'r3y-tenant-a',approvalId:randomUUID(),
  decision:'APPROVED',approverUserId:'t1e-stage-foreign'
 });
 expect(crossHeader.status).toBe(403);
});
test('T17-004 interactive reviewer can approve a campaign then maker performs consent-gated email with zero effects',async({page})=>{
 await signIn(page,'admin');await studio(page);const id=await create(page);
 await independentCampaignApproval(page,id);
 await switchIdentity(page,'admin');await studio(page);await load(page,id);
 await page.getByRole('button',{name:'Create synthetic recipient and mock consent'}).click();
 await expect(page.getByRole('status').filter({hasText:'anonymous synthetic recipient'}))
  .toBeVisible();
 await page.getByRole('button',{name:/Simulate consent-gated email/}).click();
 await expect(page.getByRole('status').filter({hasText:'actual messages sent: 0'}))
  .toBeVisible();
 const s=await success(page,'journeys/'+id);
 expect(s.emailSimulations[0].result.actualMessagesSent).toBe(0);
 expect(s.stages.syntheticEmailSimulated).toBe(true);
 expect(s.externalEffectsAuthorized).toBe(false);
});
test('T17-005 revoking a signed browser session blocks replay across audited campaign requests',async({page})=>{
 await signIn(page,'admin');await studio(page);const id=await create(page);
 const stale=(await page.context().cookies(frontend)).find(c=>c.name===SESSION_COOKIE);
 expect(stale?.httpOnly).toBe(true);
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 await page.context().addCookies([stale!]);
 const me=await api(page,'me');
 expect(me.status).toBe(401);
 const denied=await api(page,'journeys/'+id);
 expect(denied.status).toBe(401);
 const direct=await api(page,'publications/send-now',{externalEffectsAuthorized:true});
 expect(direct.status).toBeGreaterThanOrEqual(400);
});
