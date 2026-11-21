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
test('T1E-001 real browser self-hosted staging OIDC login binds signed subject and org to DB',async({page})=>{
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
});
test('T1E-002 independent reviewer uses actual interactive signed OIDC session',async({page})=>{
 await login(page,'reviewer');
 const me=await bff(page,'me');
 expect(me.status).toBe(200);
 expect(me.data.userId).toBe(actor('reviewer'));
 expect(me.data.organizationId).toBe(tenant('reviewer'));
});
test('T1E-003 signed viewer cannot bypass canonical permission checks from browser',async({page})=>{
 await login(page,'viewer');
 const denied=await bff(page,'assets/offline-raster',{
  brandId,title:'Forged offline creative',
  editableCopy:'Viewer cannot create',pngBase64:'iVBORw0KGgo',
  rightsExpiresAt:new Date(Date.now()+86400000).toISOString(),
  requestKey:randomUUID()
 });
 expect(denied.status).toBe(403);
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
 await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption(brandId);
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
 expect(journey.data).toMatchObject({campaign:{id:campaignId},
  workflow:{status:'WAITING_APPROVAL'}});
 const budget=await bff(page,'agents/budget');
 expect(budget.status).toBe(200);
 expect(budget.data.enabled).toBe(false);
});
