import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {seal,SESSION_COOKIE} from '../src/lib/marketing-auth';
import {randomUUID} from 'node:crypto';
const frontend='https://127.0.0.1:3443';
const api='http://127.0.0.1:3210';
const ctl='http://127.0.0.1:3216';
const brandId='r3y-stage-brand';
type Persona='admin'|'reviewer'|'viewer'|'foreign';
const tenant=(persona:Persona)=>persona==='foreign'?'r3y-tenant-b':'r3y-tenant-a';
const actor=(persona:Persona)=>'t1e-stage-'+persona;
async function login(page:Page,persona:Persona='admin'){
 // This selects a CI-disposable issuer fixture identity; real self-hosted
 // staging must authenticate real operators (no such selector in the app).
 // Select one synthetic individual in the isolated CI IdP, not via an
 // application query, browser trust header or public operator account.
 const pick=await page.request.post(ctl+'/__select-persona?persona='+persona);
 expect(pick.status()).toBe(200);
 expect((await pick.json()).disposableCiOnly).toBe(true);
 await page.goto('/api/auth/login');
 await expect(page).toHaveURL(frontend+'/');
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByText('Signed in as '+actor(persona)+'@example.invalid'))
  .toBeVisible();
}
async function bff(page:Page,path:string,body?:unknown){
 return page.evaluate(async ({path,body,hasBody})=>{
  const r=await fetch('/api/marketing/'+path,{
   method:hasBody?'POST':'GET',credentials:'same-origin',
   ...(hasBody?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
  });
  return{status:r.status,data:await r.json()};
 },{path,body,hasBody:body!==undefined});
}
async function provisionedSession(request:APIRequestContext,persona:Persona){
 const r=await request.post(ctl+'/__issue?persona='+persona);
 expect(r.status()).toBe(200);
 const issued=await r.json();
 const expiresAt=Date.now()+8*60_000;
 const user=await request.post(api+'/marketing/sessions',{
  headers:{authorization:'Bearer '+issued.token,'x-organization-id':tenant(persona)},
  data:{expiresAt}
 });
 expect(user.status(),await user.text()).toBe(201);
 return{token:issued.token,sessionId:(await user.json()).sessionId,expiresAt};
}
test('T1E-001 real browser self-hosted staging OIDC login binds signed subject and org to DB',async({page},testInfo)=>{
 await login(page);
 const me=await bff(page,'me');
 expect(me.status).toBe(200);
 expect(me.data).toMatchObject({userId:actor('admin'),organizationId:tenant('admin'),
  role:'ADMIN'});
 const cookie=(await page.context().cookies(frontend))
  .find(c=>c.name===SESSION_COOKIE);
 expect(cookie?.httpOnly).toBe(true);
 expect(cookie?.secure).toBe(true);
 expect(cookie?.value.split('.')).toHaveLength(5);
 const overview=page.getByRole('region',{name:'Executive overview'});
 await expect(overview).toBeVisible();
 await testInfo.attach('alpha-desktop-overview',{body:await page.screenshot(),contentType:'image/png'});
 const nav=page.getByRole('navigation',{name:'Marketing workspaces'});
 await nav.getByRole('link',{name:'Agent brain & plans'}).click();
 await expect(page.locator('#portfolio')).toBeHidden();
 await page.getByRole('button',{name:'Load brain map',exact:true}).click();
 const map=page.getByRole('region',{name:'Visual agent and nervous system map'});
 await expect(map).toBeVisible();
 await expect(map.locator('button[aria-pressed]')).toHaveCount(13);
 await map.locator('button[aria-pressed]').last().click();
 await expect(map.locator('button[aria-pressed=true]')).toHaveCount(1);
 await testInfo.attach('alpha-agent-network',{body:await page.screenshot(),contentType:'image/png'});
 await nav.getByRole('link',{name:'Signed Agent Studio'}).click();
 await expect(page.locator('#agent-brain')).toBeHidden();
 await page.getByRole('button',{name:'Load canonical agents and releases'}).click();
 await page.getByRole('combobox',{name:'Canonical agent',exact:true}).selectOption('MKT-CMO-001');
 await expect(page.getByLabel('Agent release policy overview')).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await nav.getByRole('link',{name:'Sign in & organization'}).click();
 await expect(page.locator('#identity')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
 const search=nav.getByRole('searchbox',{name:'Find workspace'});
 await search.focus();
 await page.keyboard.type('workflow');
 await expect(nav.getByRole('link',{name:'Workflow Studio',exact:true})).toBeVisible();
 await search.fill('');
 await testInfo.attach('alpha-mobile-identity',{body:await page.screenshot(),contentType:'image/png'});
 await nav.getByRole('button',{name:'Show all workspaces'}).click();
 await expect(overview).toBeVisible();
 await expect(page.locator('#portfolio')).toBeVisible();
 // Phase 4: actual signed browser, not a static mockup. Visual changes
 // remain an unsigned draft; the canonical simulation/approval path is reused.
 await nav.getByRole('link',{name:'Blueprint Studio',exact:true}).click();
 const bp=page.getByRole('region',{name:'R3 Blueprint and Workflow virtual studio'});
 await expect(bp).toBeVisible();
 await bp.getByRole('button',{name:'Start bounded visual blueprint'}).click();
 await bp.getByText('Visual offline workflow builder · controlled nodes and edges',{exact:true}).click();
 await expect(bp.getByRole('img',{name:'Directed offline workflow graph'})).toBeVisible();
 await bp.getByRole('textbox',{name:'New node ID'}).fill('extra-review');
 await bp.getByRole('button',{name:'Add bounded node'}).click();
 expect(JSON.parse(await bp.getByRole('textbox',{name:'Versioned workflow JSON'}).inputValue()).nodes.some((n:{id:string})=>n.id==='extra-review')).toBe(true);
 await bp.getByRole('button',{name:'Remove extra-review',exact:true}).click();
 await bp.getByRole('button',{name:'Simulate blueprint · No execution'}).click();
 await expect(bp.getByRole('status').filter({hasText:'SIMULATED'})).toBeVisible();
 await bp.getByRole('button',{name:'Prepare for signed offline Workflow Studio'}).click();
 const dag=page.getByRole('region',{name:'R3-G governed offline DAG console'});
 await expect(dag.getByRole('status').filter({hasText:'Unsigned draft imported'})).toBeVisible();
 await expect(dag.getByRole('textbox',{name:'Ed25519 signature (base64url)'})).toHaveValue('');
 await expect(dag.getByRole('textbox',{name:'Blueprint ID'})).toHaveValue('offline-science-review');
 await expect(page.locator('#workflow-studio')).toBeFocused();
 await page.getByRole('button',{name:'Account & session'}).click();
 await expect(page.locator('#identity')).toBeFocused();
 await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
});
test('T1E-002 independent reviewer uses actual interactive signed OIDC session',async({page})=>{
 await login(page,'reviewer');
 const me=await bff(page,'me');
 expect(me.status).toBe(200);
 expect(me.data.userId).toBe(actor('reviewer'));
 expect(me.data.organizationId).toBe(tenant('reviewer'));
 test.setTimeout(180000);
 await page.getByRole('navigation',{name:'Marketing workspaces'}).getByRole('link',{name:'Provider contract trials'}).click();
 const lab=page.locator('#provider-trials');
 await lab.getByRole('button',{name:'Load trial provider catalog'}).click();
 await lab.getByRole('combobox',{name:'Failure/success scenario'}).selectOption('AUTH_REJECTED');
 await lab.getByRole('button',{name:'Run selected scenario across catalog'}).click();
 await expect(lab.getByRole('status').filter({hasText:'14/14 observed · Matrix evidence recorded'})).toBeVisible({timeout:90000});
 const results=lab.getByRole('table',{name:'Cross-provider rehearsal results'});
 await expect(results.getByRole('row')).toHaveCount(15);
 await expect(results.getByRole('cell',{name:'BLOCKED',exact:true})).toHaveCount(14);
 const history=await bff(page,'integrations/trials/history');
 expect(history.status).toBe(200);
 expect(history.data).toMatchObject({organizationId:tenant('reviewer'),fixtureOnly:true,realAccountsConnected:0,actualProviderRequests:0,externalEffectsAuthorized:false,productionCertified:false});
 expect(history.data.entries.filter((e:any)=>e.scenario==='AUTH_REJECTED'&&e.contractOutcome==='BLOCKED').length).toBeGreaterThanOrEqual(14);
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await page.getByRole('navigation',{name:'Marketing workspaces'}).getByRole('link',{name:'Provider contract trials'}).click();
 await lab.getByRole('button',{name:'Refresh stored trial evidence'}).click();
 await expect(lab.getByRole('table',{name:'Stored provider trial evidence'})).toBeVisible();
 await expect(lab.getByRole('table',{name:'Cross-provider rehearsal results'})).toHaveCount(0);
});
test('T1E-003 signed viewer cannot bypass canonical permission checks from browser',async({page})=>{
 await login(page,'viewer');
 // READ_PORTFOLIO is permitted, READ_APPROVALS is not. A forbidden inbox
 // must not prevent the authorized portfolio from loading.
 await expect(page.locator('#portfolio').getByText('active Objectives',{exact:true})).toBeVisible();
 await expect(page.getByText('Approval inbox is not available for your current permissions. Your permitted portfolio remains accessible.')).toBeVisible();
 expect((await bff(page,'approvals/pending')).status).toBe(403);
 expect((await bff(page,'integrations/trials/history')).status).toBe(403);
 expect((await bff(page,'integrations/trials/run',{provider:'OPENAI',scenario:'SUCCESS',requestKey:'viewer-'+randomUUID()})).status).toBe(403);
 await expect(page.locator('#approvals').getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);
 const denied=await bff(page,'assets/offline-raster',{
  brandId,title:'Forged offline creative',
  editableCopy:'Viewer cannot create',pngBase64:'iVBORw0KGgo',
  rightsExpiresAt:new Date(Date.now()+86400000).toISOString(),
  requestKey:randomUUID()
 });
 expect(denied.status).toBe(403);
 expect((await bff(page,'brain/runs/no-fixture-run/cancel',{reason:'Viewer must not cancel runs'})).status).toBe(403);
});
test('T1E-004 actual browser signed org B user cannot read org A brands',async({page})=>{
 await login(page,'foreign');
 const me=await bff(page,'me');
 expect(me.status).toBe(200);
 expect(me.data).toMatchObject({userId:actor('foreign'),
  organizationId:tenant('foreign')});
 const brands=await bff(page,'tenancy/brands');
 expect(brands.status).toBe(200);
 expect(brands.data.some((x:{id:string})=>x.id===brandId)).toBe(false);
 const forbidden=await bff(page,'requests',{
  organizationId:'r3y-tenant-a',requestedOutcome:'Forcibly crossed tenant',
  requestKey:randomUUID()
 });
 expect(forbidden.status).toBe(403);
});
test('T1E-005 real auth-server logout revokes a signed JWT session and stolen cookie',async({page})=>{
 await login(page);
 const previous=(await page.context().cookies(frontend))
  .find(c=>c.name===SESSION_COOKIE);
 expect(previous).toBeDefined();
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 await page.context().addCookies([previous!]);
 expect((await bff(page,'me')).status).toBe(401);
});
test('T1E-006 provisioned roles cannot impersonate a second tenant even with a signed token',async({request})=>{
 const r=await provisionedSession(request,'admin');
 const response=await request.get(api+'/marketing/me',{
  headers:{authorization:'Bearer '+r.token,
   'x-organization-id':'r3y-tenant-b','x-marketing-session-id':r.sessionId}
 });
 expect(response.status()).toBe(403);
});
test('T1E-007 signed staging operator drives real offline campaign workflow, no real providers',async({page})=>{
 await login(page);
 await page.locator('summary').filter({hasText:'Integrated Campaign Journey'}).click();
 const slug='alpha-brand-'+randomUUID().slice(0,8);
 const name='Alpha synthetic brand '+slug;
 const form=page.getByRole('group',{name:'Register a tenant brand'});
 await form.getByRole('textbox',{name:'New brand name'}).fill(name);
 await form.getByRole('textbox',{name:'New brand slug'}).fill(slug);
 await form.getByRole('button',{name:'Register tenant brand'}).click();
 await expect(page.getByRole('status').filter({hasText:'Tenant brand registered and read back'})).toBeVisible();
 const registered=await bff(page,'tenancy/brands');
 expect(registered.status).toBe(200);
 const createdBrand=registered.data.find((x:any)=>x.slug===slug);
 expect(createdBrand).toMatchObject({name,status:'ACTIVE'});
 await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption(createdBrand.id);
 await page.getByRole('textbox',{name:'Marketing objective (name)'})
  .fill('T1E operator scientific campaign '+randomUUID().slice(0,8));
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'Objective created in canonical catalogue'}))
  .toBeVisible();
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created campaign'}))
  .toBeVisible();
 const campaignId=await page.getByRole('textbox',{name:'Tenant campaign ID'}).inputValue();
 const journey=await bff(page,'journeys/'+campaignId);
 expect(journey.status).toBe(200);
 expect(journey.data).toMatchObject({campaign:{id:campaignId,brandId:createdBrand.id},
  workflow:{status:'WAITING_APPROVAL'}});
 const budget=await bff(page,'agents/budget');
 expect(budget.status).toBe(200);
 expect(budget.data.enabled).toBe(false);
 const queued=await bff(page,'brain/runs',{commandKey:'alpha-cancel-'+randomUUID(),requestedOutcome:'Obsolete internal rehearsal; cancel before dispatch'});
 expect(queued.status).toBe(201);
 const runId=queued.data.id;
 const brain=page.locator('#agent-brain');
 await brain.getByRole('button',{name:'Load persisted brain runs'}).click();
 await brain.getByRole('combobox',{name:'Select brain run'}).selectOption(runId);
 await brain.getByRole('textbox',{name:'Cancel queued run rationale'}).fill('Obsolete internal rehearsal, never dispatched');
 page.once('dialog',dialog=>dialog.accept());
 await brain.getByRole('button',{name:'Cancel queued Brain run'}).click();
 await expect(brain.getByRole('button',{name:'Cancel queued Brain run'})).toHaveCount(0);
 const cancelled=await bff(page,'brain/runs/'+runId);
 expect(cancelled.status).toBe(200);
 expect(cancelled.data.status).toBe('CANCELLED');
 expect(cancelled.data.steps.every((x:any)=>x.status==='PENDING')).toBe(true);
 expect((await bff(page,'brain/runs/'+runId+'/execute',{})).status).toBe(409);
 expect((await bff(page,'brain/runs/'+runId+'/recovery')).data).toMatchObject({evidenceStatus:'CANCELLED_BEFORE_START',automaticReplayAllowed:false});
});
