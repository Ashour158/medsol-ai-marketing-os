import {test,expect,type Page} from '@playwright/test';
import {seal,SESSION_COOKIE} from '../src/lib/marketing-auth';

const origin='https://127.0.0.1:3443';
const sessionId='11111111-1111-4111-8111-111111111111';
type Actor='admin'|'viewer'|'reviewer';
const actors:Record<Actor,string>={
 admin:'r3v-admin-token',viewer:'r3v-viewer-token',reviewer:'r3v-reviewer-token'
};
test.beforeEach(async({request})=>{
 const reset=await request.post('http://127.0.0.1:3209/__reset');
 expect(reset.ok()).toBeTruthy();
});
async function login(page:Page,role:Actor='admin',tenant='tenant-a'){
 const jwt=await seal({
  accessToken:actors[role],organizationId:tenant,sessionId,
  expiresAt:Date.now()+600_000
 },600);
 await page.context().clearCookies();
 await page.context().addCookies([{
  name:SESSION_COOKIE,value:jwt,url:origin,httpOnly:true,secure:true,
  sameSite:'Lax'
 }]);
 await page.goto('/');
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 if(tenant==='tenant-a')
  await expect(page.getByText('Signed in as '+role+'@simulated.invalid', {exact:false})).toBeVisible();
}
async function studio(page:Page){
 const summary=page.locator('summary').filter({hasText:'Integrated Campaign Journey'});
 await summary.click();
 await expect(page.getByRole('heading',{name:/Brief, objective and governed campaign/})).toBeVisible();
}
async function selectBrand(page:Page){
 await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption('brand-e2e');
}
async function loadJourney(page:Page){
 await page.getByRole('textbox',{name:'Tenant campaign ID'}).fill('campaign-e2e');
 await page.getByRole('button',{name:'Load durable cross-engine timeline'}).click();
 await expect(page.getByText('Chromium-only scientific campaign').first()).toBeVisible();
}
async function createCampaign(page:Page){
 await selectBrand(page);
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'Objective created'})).toBeVisible();
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created'})).toBeVisible();
}
test('T16-009 anonymous browser cannot load an authenticated marketing workspace',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Marketing Command Center'})).toBeVisible();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Request failed (401)'})).toBeVisible();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
});
test('T16-010 encrypted browser session opens the real Next UI and tenant dashboard',async({page})=>{
 await login(page);
 await expect(page.getByRole('heading',{name:'Campaign portfolio'})).toBeVisible();
 await expect(page.getByText('OFFLINE-E2E').first()).toBeVisible();
 await studio(page);
 await expect(page.getByText(/Real accounts, outbound posts, real email/)).toBeVisible();
});
test('T16-011 viewer persona has visible read-only objective and creative affordances',async({page})=>{
 await login(page,'viewer');await studio(page);
 await expect(page.getByRole('button',{name:'Create objective',exact:true}).first()).toBeDisabled();
 await expect(page.getByRole('button',{name:'Generate and verify internal flattened raster draft'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Create synthetic recipient and mock consent'})).toBeDisabled();
 await loadJourney(page);
});
test('T16-012 operator completes browser brief-to-canonical-workflow creation',async({page})=>{
 await login(page);await studio(page);await createCampaign(page);
 await expect(page.getByText(/Workflow: workflow-e2e/)).toBeVisible();
 await expect(page.getByText(/PENDING_APPROVAL/).first()).toBeVisible();
});
test('T16-013 operator invokes the simulated 13-agent brain and inspects its ledger',async({page})=>{
 await login(page);await studio(page);await createCampaign(page);
 await page.getByRole('button',{name:'Run governed 13-agent offline brain'}).click();
 await expect(page.getByRole('status').filter({hasText:'COMPLETED'})).toBeVisible();
 await expect(page.getByText(/Brain ledger: brain-e2e/)).toBeVisible();
});
test('T16-014 Chromium produces actual PNG bytes and exposes alt-labelled offline preview',async({page})=>{
 await login(page);await studio(page);await selectBrand(page);
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'Stored actual synthetic PNG'})).toBeVisible();
 await expect(page.getByRole('img',{name:'Generated offline campaign preview; not publishable media'})).toBeVisible();
 await expect(page.getByText(/Revision revision-e2e/)).toBeVisible();
});
test('T16-015 creator cannot self-approve even with an enabled reviewer control',async({page})=>{
 await login(page);await studio(page);await loadJourney(page);
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Creator cannot self-approve'})).toBeVisible();
 await expect(page.getByText(/PENDING_APPROVAL/).first()).toBeVisible();
});
test('T16-016 mobile-sized real browser retains readable journey controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await login(page);await studio(page);
 await expect(page.getByRole('heading',{name:/Synthetic audience, consent and email journey/})).toBeVisible();
 await expect(page.getByRole('button',{name:'Generate and verify internal flattened raster draft'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Campaign brief (reviewed as unverified instructions)'})).toBeVisible();
});
test('T16-017 keyboard can open offline journey and reach labelled brief field',async({page})=>{
 await login(page);
 const summary=page.locator('summary').filter({hasText:'Integrated Campaign Journey'});
 await summary.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:/Brief, objective and governed campaign/})).toBeVisible();
 const brief=page.getByRole('textbox',{name:'Campaign brief (reviewed as unverified instructions)'});
 await brief.focus();await expect(brief).toBeFocused();
 await brief.fill('Browser keyboard-only offline brief; absolutely no provider connections.');
 await expect(brief).toHaveValue(/Browser keyboard-only/);
});
test('T16-018 browser logout revokes simulated session and returns to signed-out view',async({page})=>{
 await login(page);
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Request failed (401)'})).toBeVisible();
});
test('T16-019 real browser CSRF POST is rejected by Next same-origin boundary',async({page})=>{
 await login(page);
 const res=await page.context().request.post(origin+'/api/marketing/campaigns/transition',{
  headers:{origin:'https://attacker.invalid','content-type':'application/json'},
  data:{organizationId:'tenant-a'}
 });
 expect(res.status()).toBe(403);
 expect((await res.json()).error).toMatch(/Origin validation failed/);
});
test('T16-020 browser refuses direct social sends and external email delivery routes',async({page})=>{
 await login(page);
 for(const path of ['/api/marketing/publications/id-e2e/publish',
   '/api/marketing/email/send','/api/marketing/audience/export']){
  const r=await page.evaluate(async p=>{
   const res=await fetch(p,{method:p.includes('export')?'GET':'POST',
    headers:{'content-type':'application/json'},body:p.includes('export')?undefined:'{}'});
   return res.status;
  },path);
  expect(r,path).toBe(404);
 }
});
test('T01-021 a separately sealed foreign-tenant session cannot read tenant A',async({page})=>{
 await login(page,'admin','tenant-b');
 await expect(page.getByRole('alert').filter({hasText:'Cross-tenant access denied'})).toBeVisible();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
});
test('T01-022 forged browser tenant and authorization headers cannot override sealed identity',async({page})=>{
 await login(page);
 const returned=await page.evaluate(async()=>{
  const response=await fetch('/api/marketing/me',{
   headers:{'x-organization-id':'attacker-tenant',
    'x-marketing-session-id':'attacker-session',
    authorization:'Bearer attacker'}
  });
  return {status:response.status,identity:await response.json()};
 });
 expect(returned.status).toBe(200);
 expect(returned.identity).toMatchObject({organizationId:'tenant-a',userId:'browser-admin'});
});
test('T10-002 UI consent gate permits only virtual email, never a real recipient',async({page})=>{
 await login(page);await studio(page);await selectBrand(page);await loadJourney(page);
 await page.getByRole('button',{name:'Create synthetic recipient and mock consent'}).click();
 await expect(page.getByRole('status').filter({hasText:'anonymous synthetic recipient'})).toBeVisible();
 await page.getByRole('button',{name:/Simulate consent-gated email/}).click();
 await expect(page.getByRole('status').filter({hasText:'actual messages sent: 0'})).toBeVisible();
});
test('T07-027 browser quarantines offline feedback without promoting model skills',async({page})=>{
 await login(page);await studio(page);await loadJourney(page);
 await page.getByRole('button',{name:'Quarantine synthetic learning observation'}).click();
 await expect(page.getByRole('status').filter({hasText:'Feedback quarantined'})).toBeVisible();
 await expect(page.getByText(/Simulated outcomes cannot prove impressions/)).toBeVisible();
});
test('T09-002 browser completes simulated creative-to-social approval separation',async({page})=>{
 await login(page);await studio(page);await createCampaign(page);
 await page.getByRole('button',{name:'Generate and verify internal flattened raster draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'Stored actual synthetic PNG'})).toBeVisible();
 // A second human reviewer exercises rights and campaign approval separately.
 await login(page,'reviewer');await studio(page);await loadJourney(page);
 await page.getByRole('button',{name:'Review offline rights as separate reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'rights review recorded'})).toBeVisible();
 await page.getByRole('button',{name:'Approve campaign as authenticated reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'campaign approval recorded'})).toBeVisible();
 await login(page);await studio(page);await loadJourney(page);
 await page.getByRole('button',{name:'Register inert social destination metadata'}).click();
 await expect(page.getByRole('status').filter({hasText:'PENDING_VERIFICATION'})).toBeVisible();
 await page.getByRole('button',{name:'Submit exact offline creative for approval'}).click();
 await expect(page.getByRole('status').filter({hasText:'awaits independent reviewer'})).toBeVisible();
 await login(page,'reviewer');await studio(page);await loadJourney(page);
 await page.getByRole('button',{name:'Approve exact scope as independent reviewer'}).click();
 await expect(page.getByRole('status').filter({hasText:'exact-scope creative approval'})).toBeVisible();
 await login(page);await studio(page);await loadJourney(page);
 await page.getByRole('button',{name:'Prepare governed publication intent'}).click();
 await expect(page.getByRole('status').filter({hasText:'provider egress permanently blocked'})).toBeVisible();
 await page.getByRole('button',{name:'Execute internal social transport simulation'}).click();
 await expect(page.getByRole('status').filter({hasText:'zero remote requests or posts'})).toBeVisible();
 await expect(page.getByText(/Social attempts: 1/)).toBeVisible();
});
