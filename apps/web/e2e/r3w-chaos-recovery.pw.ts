import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {seal,SESSION_COOKIE} from '../src/lib/marketing-auth';

/** R3-W browser chaos covers the real Next UI and encrypted BFF, while the
 * downstream owner is a **localhost-only mock**, never a live provider or DB.
 * No browser case is counted as independently signed product E2E.
 */
const origin='https://127.0.0.1:3443';
const fixture='http://127.0.0.1:3209';
const sessionId='11111111-1111-4111-8111-111111111111';
type Actor='admin'|'viewer'|'reviewer';
const actors:Record<Actor,string>={
 admin:'r3v-admin-token',viewer:'r3v-viewer-token',reviewer:'r3v-reviewer-token'
};
test.beforeEach(async({request})=>expect((await request.post(fixture+'/__reset')).ok()).toBeTruthy());
async function login(page:Page,role:Actor='admin',opts?:{tenant?:string;expiresAt?:number}){
 const jwt=await seal({
  accessToken:actors[role],organizationId:opts?.tenant??'tenant-a',sessionId,
  expiresAt:opts?.expiresAt??Date.now()+600_000
 },600);
 await page.context().clearCookies();
 await page.context().addCookies([{
  name:SESSION_COOKIE,value:jwt,url:origin,httpOnly:true,secure:true,sameSite:'Lax'
 }]);
 await page.goto('/');
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 if((opts?.tenant??'tenant-a')==='tenant-a'&&(opts?.expiresAt??1)>Date.now())
  await expect(page.getByText('Signed in as '+role+'@simulated.invalid')).toBeVisible();
}
async function studio(page:Page){
 await page.locator('summary').filter({hasText:'Integrated Campaign Journey'}).click();
 await expect(page.getByRole('heading',{name:/Brief, objective and governed campaign/})).toBeVisible();
}
async function brand(page:Page){
 await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption('brand-e2e');
}
async function journey(page:Page,id='campaign-e2e'){
 await page.getByRole('textbox',{name:'Tenant campaign ID'}).fill(id);
 await page.getByRole('button',{name:'Load durable cross-engine timeline'}).click();
 await expect(page.getByText(id==='campaign-e2e'?'Chromium-only scientific campaign':'Separate tenant campaign fixture').first()).toBeVisible();
}
async function creative(page:Page){
 await brand(page);
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'Stored actual synthetic PNG'})).toBeVisible();
}
async function fault(request:APIRequestContext,method:'GET'|'POST',path:string,
 status=503,message='Synthetic upstream unavailable',kind:'json'|'disconnect'|'preview_mismatch'='json'){
 const r=await request.post(fixture+'/__fault',{data:{method,path,status,message,kind}});
 expect(r.status()).toBe(200);
}
async function state(request:APIRequestContext):Promise<any>{
 const r=await request.get(fixture+'/__state');expect(r.ok()).toBeTruthy();
 return r.json();
}
async function direct(page:Page,path:string,body:unknown,method:'GET'|'POST'='POST'){
 return page.evaluate(async({path,body,method})=>{
  const r=await fetch('/api/marketing/'+path,{
   method,credentials:'same-origin',
   ...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
  });return{status:r.status,body:await r.json()};
 },{path,body,method});
}
async function createCampaign(page:Page){
 await brand(page);
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'Objective created'})).toBeVisible();
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created'})).toBeVisible();
}
async function preparePublication(page:Page){
 await login(page);await studio(page);await createCampaign(page);await creative(page);
 await login(page,'reviewer');await studio(page);await journey(page);
 await page.getByRole('button',{name:'Review offline rights as separate reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'rights review recorded'})).toBeVisible();
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'campaign approval recorded'})).toBeVisible();
 await login(page);await studio(page);await journey(page);
 await page.getByRole('button',{name:'Register inert social destination metadata'}).click();
 await expect(page.getByRole('status').filter({hasText:'PENDING_VERIFICATION'})).toBeVisible();
 await page.getByRole('button',{name:'Submit exact offline creative for approval'}).click();
 await expect(page.getByRole('status').filter({hasText:'awaits independent reviewer'})).toBeVisible();
 await login(page,'reviewer');await studio(page);await journey(page);
 await page.getByRole('button',{name:'Approve exact scope as independent reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'exact-scope creative approval'})).toBeVisible();
 await login(page);await studio(page);await journey(page);
 await page.getByRole('button',{name:'Prepare governed publication intent'}).click();
 await expect(page.getByRole('status').filter({hasText:'provider egress permanently blocked'})).toBeVisible();
}

// Tenant, session and boundary acceptance
test('T01-023 tampered encrypted browser cookie cannot reach marketing API',async({page,request})=>{
 await login(page);
 await page.context().clearCookies();
 await page.context().addCookies([{name:SESSION_COOKIE,value:'deliberately-tampered',
  url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
 expect((await direct(page,'me',null,'GET')).status).toBe(401);
 expect((await state(request)).requestLog).toHaveLength(0);
});
test('T01-024 expired signed session is rejected before hitting tenant data',async({page,request})=>{
 await login(page,'admin',{expiresAt:Date.now()-5000});
 await expect(page.getByRole('alert').filter({hasText:'Request failed (401)'})).toBeVisible();
 expect((await direct(page,'me',null,'GET')).status).toBe(401);
 expect((await state(request)).requestLog).toHaveLength(0);
});
test('T01-025 failed foreign campaign lookup retains only explicitly loaded tenant campaign',async({page})=>{
 await login(page);await studio(page);await journey(page);
 await page.getByRole('textbox',{name:'Tenant campaign ID'}).fill('foreign-private-campaign');
 await page.getByRole('button',{name:'Load durable cross-engine timeline'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Unsupported simulated route'})).toBeVisible();
 await expect(page.getByText(/Loaded campaign:/)).toContainText('Chromium-only scientific campaign');
 await expect(page.getByText('Separate tenant campaign fixture')).toHaveCount(0);
});
test('T01-026 switching to another campaign clears prior asset and approval affordances',async({page})=>{
 await login(page);await studio(page);await journey(page);await creative(page);
 await expect(page.getByText(/Revision revision-e2e/)).toBeVisible();
 await journey(page,'campaign-alt-e2e');
 await expect(page.getByText(/Revision revision-e2e/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Prepare governed publication intent'})).toBeDisabled();
 await expect(page.getByText(/Loaded campaign:/)).toContainText('Separate tenant campaign fixture');
});
test('T01-027 revoked server session rejects reinstalled stolen encrypted cookie',async({page,request})=>{
 await login(page);
 const original=(await page.context().cookies(origin)).find(c=>c.name===SESSION_COOKIE);
 expect(original?.value).toBeTruthy();
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 await page.context().addCookies([{name:SESSION_COOKIE,value:original!.value,url:origin,
  httpOnly:true,secure:true,sameSite:'Lax'}]);
 const attempted=await direct(page,'me',null,'GET');
 expect(attempted.status).toBe(401);
 expect((await state(request)).revokedSessions).toContain(sessionId);
});
test('T01-028 viewer direct BFF mutation is refused by role authority',async({page,request})=>{
 await login(page,'viewer');
 const r=await direct(page,'objectives',{name:'Unauthorized'});
 expect(r.status).toBe(403);
 expect((await state(request)).requestLog.filter((v:any)=>v.path==='/marketing/objectives')).toHaveLength(0);
});

// Workflow failure and controlled recovery
test('T04-004 workflow service outage never creates a ghost campaign in UI',async({page,request})=>{
 await login(page);await studio(page);await brand(page);
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'Objective created'})).toBeVisible();
 await fault(request,'POST','/marketing/workflows',503,'Synthetic workflow offline');
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('alert').filter({hasText:'Synthetic workflow offline'})).toBeVisible();
 await expect(page.getByText(/Workflow: workflow-e2e/)).toHaveCount(0);
 expect((await state(request)).requestLog.filter((x:any)=>x.path==='/marketing/workflows')).toHaveLength(0);
});
test('T04-005 429 workflow throttle allows explicit retry without phantom duplicate',async({page,request})=>{
 await login(page);await studio(page);await brand(page);
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await fault(request,'POST','/marketing/workflows',429,'Offline throttled');
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('alert').filter({hasText:'Offline throttled'})).toBeVisible();
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created'})).toBeVisible();
 expect((await state(request)).requestLog.filter((x:any)=>x.path==='/marketing/workflows')).toHaveLength(1);
});
test('T04-006 severed local upstream connection yields controlled 502 and operator retry',async({page,request})=>{
 await login(page);await studio(page);await brand(page);
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await fault(request,'POST','/marketing/workflows',502,'Connection closed','disconnect');
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('alert').filter({hasText:'Marketing API unavailable'})).toBeVisible();
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created'})).toBeVisible();
});
test('T04-007 persisted campaign timeline rehydrates after a fresh browser page',async({page})=>{
 await login(page);await studio(page);await createCampaign(page);
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await studio(page);await journey(page);
 await expect(page.getByText(/Workflow: workflow-e2e/)).toBeVisible();
});

// Agent handoff interruption
test('T05-002 interrupted agent execution never claims completed evidence',async({page,request})=>{
 await login(page);await studio(page);await journey(page);
 await fault(request,'POST','/marketing/brain/runs/brain-e2e/execute',503,'Agent lease interrupted');
 await page.getByRole('button',{name:'Run governed 13-agent offline brain'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Agent lease interrupted'})).toBeVisible();
 await expect(page.getByText(/Brain ledger: brain-e2e/)).toBeVisible();
 expect((await state(request)).brainRuns).toHaveLength(0);
});
test('T05-003 interrupted brain run cannot replay automatically after browser refresh',async({page,request})=>{
 await login(page);await studio(page);await journey(page);
 await fault(request,'POST','/marketing/brain/runs/brain-e2e/execute',503,'No automatic replay');
 await page.getByRole('button',{name:'Run governed 13-agent offline brain'}).click();
 await expect(page.getByRole('alert').filter({hasText:'No automatic replay'})).toBeVisible();
 const before=(await state(request)).requestLog.filter((x:any)=>x.path.includes('/execute')).length;
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await studio(page);await journey(page);
 const after=(await state(request)).requestLog.filter((x:any)=>x.path.includes('/execute')).length;
 expect(after).toBe(before);
 expect((await direct(page,'brain/runs/brain-e2e',null,'GET')).body.status).toBe('PENDING');
});

// Governed integration and quarantined learning
test('T06-022 registering inert social metadata never performs real provider network egress',async({page,request})=>{
 await login(page);await studio(page);await brand(page);
 await page.getByRole('button',{name:'Register inert social destination metadata'}).click();
 await expect(page.getByRole('status').filter({hasText:'PENDING_VERIFICATION'})).toBeVisible();
 const x=await state(request);
 expect([x.externalNetworkRequests,x.realEmailsSent,x.realSocialPosts]).toEqual([0,0,0]);
});
test('T07-028 quarantined synthetic learning survives reload without promoted skills',async({page,request})=>{
 await login(page);await studio(page);await journey(page);
 await page.getByRole('button',{name:'Quarantine synthetic learning observation'}).click();
 await expect(page.getByRole('status').filter({hasText:'Feedback quarantined'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await studio(page);await journey(page);
 const x=await direct(page,'journeys/campaign-e2e',null,'GET');
 expect(x.body.learningSignals).toMatchObject([{status:'QUARANTINED'}]);
 expect((await state(request)).requestLog.some((z:any)=>z.path.includes('/skills/')&&z.method==='POST')).toBe(false);
});
test('T07-029 learning ingestion failure does not mark the observation quarantined',async({page,request})=>{
 await login(page);await studio(page);await journey(page);
 await fault(request,'POST','/marketing/learning/signals',503,'Learning store unavailable');
 await page.getByRole('button',{name:'Quarantine synthetic learning observation'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Learning store unavailable'})).toBeVisible();
 expect((await state(request)).learningSignals).toHaveLength(0);
});
test('T07-030 simulated observations are never converted into verified lessons automatically',async({page,request})=>{
 await login(page);await studio(page);await journey(page);
 await page.getByRole('button',{name:'Quarantine synthetic learning observation'}).click();
 await expect(page.getByRole('status').filter({hasText:'Feedback quarantined'})).toBeVisible();
 const x=await state(request);
 expect(x.learningSignals).toEqual([{id:'signal-e2e',status:'QUARANTINED',topic:'offline acceptance'}]);
 expect(x.requestLog.filter((z:any)=>/\\/learning\\/(proposals|skills|knowledge)/.test(z.path))).toHaveLength(0);
});
test('T08-003 unavailable approved brand policy blocks creative release submission',async({page,request})=>{
 await fault(request,'GET','/marketing/brand/active',503,'Brand policy unavailable');
 await login(page);await studio(page);await creative(page);
 await page.getByRole('button',{name:'Register inert social destination metadata'}).click();
 await expect(page.getByRole('textbox',{name:'Current approved brand policy version'})).toHaveValue('');
 await expect(page.getByRole('button',{name:'Submit exact offline creative for approval'})).toBeDisabled();
});

// Social approval / publication simulation
test('T09-003 creator cannot falsely approve their own creative rights evidence',async({page})=>{
 await login(page);await studio(page);await creative(page);
 await page.getByRole('button',{name:'Review offline rights as separate reviewer'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Separate reviewer required'})).toBeVisible();
});
test('T09-004 direct publication without exact human approval is denied by synthetic authority',async({page,request})=>{
 await login(page);
 const r=await direct(page,'publications',{campaignId:'campaign-e2e',approvalId:'forged'});
 expect(r.status).toBe(403);
 expect((await state(request)).publications).toHaveLength(0);
});
test('T09-005 sandbox transport 503 cannot manufacture successful social attempts',async({page,request})=>{
 await preparePublication(page);
 await fault(request,'POST','/marketing/publications/publication-e2e/simulate',503,'Sandbox delivery incident');
 await page.getByRole('button',{name:'Execute internal social transport simulation'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Sandbox delivery incident'})).toBeVisible();
 expect((await state(request)).publications).toHaveLength(0);
});
test('T09-006 manual retry after transport outage records one sandbox attempt only',async({page,request})=>{
 await preparePublication(page);
 await fault(request,'POST','/marketing/publications/publication-e2e/simulate',503,'Sandbox retry required');
 await page.getByRole('button',{name:'Execute internal social transport simulation'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Sandbox retry required'})).toBeVisible();
 await page.getByRole('button',{name:'Execute internal social transport simulation'}).click();
 await expect(page.getByRole('status').filter({hasText:'zero remote requests or posts'})).toBeVisible();
 expect((await state(request)).publications[0].attempts).toMatchObject([{mode:'SANDBOX',outcome:'SUCCESS'}]);
});
test('T09-007 simulated publication metrics are not misreported as real reach or ROI',async({page,request})=>{
 await login(page);await studio(page);await journey(page);
 await expect(page.getByText(/Simulated outcomes cannot prove impressions/)).toBeVisible();
 await expect(page.getByText(/Independently reviewed source metrics: 0/)).toBeVisible();
 const x=await state(request);
 expect(x.realSocialPosts).toBe(0);
});

// Consent and email safety
test('T10-003 synthetic email without explicit mock consent is denied',async({page,request})=>{
 await login(page);
 const r=await direct(page,'email/simulations',{campaignId:'campaign-e2e',contactIds:['contact-e2e']});
 expect(r.status).toBe(403);
 expect((await state(request)).emailSimulations).toHaveLength(0);
});
test('T10-004 mock consent withdrawal stops subsequent synthetic email simulation',async({page,request})=>{
 await login(page);await studio(page);await brand(page);await journey(page);
 await page.getByRole('button',{name:'Create synthetic recipient and mock consent'}).click();
 await expect(page.getByRole('status').filter({hasText:'anonymous synthetic recipient'})).toBeVisible();
 const revoked=await direct(page,'audience/synthetic-contacts/contact-e2e/consent',{action:'SIMULATED_OPT_OUT'});
 expect(revoked.status).toBe(200);
 await page.getByRole('button',{name:/Simulate consent-gated email/}).click();
 await expect(page.getByRole('alert').filter({hasText:'Consent required'})).toBeVisible();
 expect((await state(request)).emailSimulations).toHaveLength(0);
});
test('T10-005 virtual email outcome preserves zero sends and zero provider calls',async({page,request})=>{
 await login(page);await studio(page);await brand(page);await journey(page);
 await page.getByRole('button',{name:'Create synthetic recipient and mock consent'}).click();
 await expect(page.getByRole('status').filter({hasText:'anonymous synthetic recipient'})).toBeVisible();
 await page.getByRole('button',{name:/Simulate consent-gated email/}).click();
 await expect(page.getByRole('status').filter({hasText:'actual messages sent: 0'})).toBeVisible();
 const x=await state(request);
 expect(x.emailSimulations[0].result.actualMessagesSent).toBe(0);
 expect([x.externalNetworkRequests,x.realEmailsSent,x.realSocialPosts]).toEqual([0,0,0]);
});
test('T10-006 send simulation control stays disabled without synthetic audience',async({page})=>{
 await login(page);await studio(page);await journey(page);
 await expect(page.getByRole('button',{name:/Simulate consent-gated email/})).toBeDisabled();
});

// Creative evidence failure modes
test('T11-002 creative owner outage cannot leave usable offline raster draft',async({page,request})=>{
 await login(page);await studio(page);await brand(page);
 await fault(request,'POST','/marketing/assets/offline-raster',503,'Creative storage unavailable');
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Creative storage unavailable'})).toBeVisible();
 await expect(page.getByText(/Revision revision-e2e/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Submit exact offline creative for approval'})).toBeDisabled();
});
test('T11-003 media readback failure leaves offline asset unverified and unapprovable',async({page,request})=>{
 await login(page);await studio(page);await brand(page);
 await fault(request,'POST','/marketing/media/evidence/revision-e2e/verify-offline',503,'Raster readback denied');
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Raster readback denied'})).toBeVisible();
 await expect(page.getByText(/Revision revision-e2e/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Submit exact offline creative for approval'})).toBeDisabled();
});
test('T11-004 forged readback digest or image origin cannot produce approved preview',async({page,request})=>{
 await login(page);await studio(page);await brand(page);
 await fault(request,'GET','/marketing/assets/revisions/revision-e2e/offline-preview',503,
  'Offline preview digest mismatch','preview_mismatch');
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Offline preview digest or origin mismatch'})).toBeVisible();
 await expect(page.getByText(/Revision revision-e2e/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Submit exact offline creative for approval'})).toBeDisabled();
});

// Evidence quality and read-only operations
test('T12-001 research UI explicitly forbids treating offline agents as verified scientific claims',async({page})=>{
 await login(page);await studio(page);await journey(page);
 await page.getByRole('button',{name:'Run governed 13-agent offline brain'}).click();
 await expect(page.getByText(/Agent recommendations are not established scientific claims/)).toBeVisible();
 await expect(page.getByText(/Research authenticity/)).toHaveCount(0);
});
test('T13-004 read-only release panel shows independent verification still blocked',async({page})=>{
 await login(page);
 await page.getByRole('button',{name:'Inspect release gates'}).click();
 await expect(page.getByText(/Release verdict: NOT CERTIFIED/)).toBeVisible();
 await expect(page.getByText(/Independent operator acceptance required/)).toBeVisible();
 await expect(page.getByText('BLOCKED')).toBeVisible();
});
test('T13-005 recovery panel exposes no automatic replay or release certification path',async({page,request})=>{
 await login(page);
 await page.getByRole('textbox',{name:'Offline workflow execution ID'}).fill('workflow-e2e');
 await page.getByRole('button',{name:'Inspect recovery ledger'}).click();
 await expect(page.getByText(/Automatic replay:/)).toContainText('prohibited');
 await expect(page.getByText(/Signature trusted: false/)).toBeVisible();
 expect((await state(request)).requestLog.filter((x:any)=>x.method==='POST'&&x.path.includes('resume'))).toHaveLength(0);
});
test('T15-023 temporary release-gate outage displays error then supports explicit refresh',async({page,request})=>{
 await login(page);
 await fault(request,'GET','/marketing/architecture/readiness',503,'Audit service is unavailable');
 await page.getByRole('button',{name:'Inspect release gates'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Audit service is unavailable'})).toBeVisible();
 await page.getByRole('button',{name:'Inspect release gates'}).click();
 await expect(page.getByText(/Release verdict: NOT CERTIFIED/)).toBeVisible();
});
test('T15-026 interrupted learning call does not silently retry or approve quarantine',async({page,request})=>{
 await login(page);await studio(page);await journey(page);
 await fault(request,'POST','/marketing/learning/signals',502,'Connection severed','disconnect');
 await page.getByRole('button',{name:'Quarantine synthetic learning observation'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Marketing API unavailable'})).toBeVisible();
 expect((await state(request)).learningSignals).toHaveLength(0);
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 expect((await state(request)).learningSignals).toHaveLength(0);
});
