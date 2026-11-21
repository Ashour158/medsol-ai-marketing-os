import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {SESSION_COOKIE} from '../src/lib/marketing-auth';
const frontend='https://127.0.0.1:3443';
const issuer='https://127.0.0.1:3215';
const clientId='r3y-disposable-browser';
const redirect=frontend+'/api/auth/callback';
async function login(page:import('@playwright/test').Page){
 await page.goto('/api/auth/login');
 await expect(page).toHaveURL(frontend+'/');
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByText('Signed in as r3y-stage-admin@example.invalid'))
  .toBeVisible();
}
test('T1D-001 browser signs in via real OIDC code/PKCE and actual Nest user-session RLS',async({page})=>{
 await login(page);
 const r=await page.evaluate(async()=>{
  const response=await fetch('/api/marketing/me',{credentials:'same-origin'});
  return{status:response.status,data:await response.json()};
 });
 expect(r.status).toBe(200);
 expect(r.data).toMatchObject({userId:'r3y-stage-admin',
  organizationId:'r3y-tenant-a',role:'ADMIN'});
 const cookies=await page.context().cookies(frontend);
 const session=cookies.find(c=>c.name===SESSION_COOKIE);
 expect(session?.httpOnly).toBe(true);
 expect(session?.secure).toBe(true);
 expect(session?.value?.split('.')).toHaveLength(5); // AES-GCM compact JWE
 expect(session?.value).not.toContain('r3y-stage-admin');
});
test('T1D-002 interactive logout revokes real server session and rejects replayed cookie',async({page})=>{
 await login(page);
 const original=(await page.context().cookies(frontend))
  .find(c=>c.name===SESSION_COOKIE);
 expect(original).toBeDefined();
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByText('Signed in as r3y-stage-admin@example.invalid'))
  .toBeVisible();
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 await page.context().addCookies([original!]);
 const status=await page.evaluate(async()=>
  (await fetch('/api/marketing/me',{credentials:'same-origin'})).status);
 expect(status).toBe(401);
});
test('T1D-003 callback without an active encrypted PKCE flow never establishes a session',async({page})=>{
 await page.goto('/api/auth/callback?state=forged-state&code=forged-code');
 await expect(page).toHaveURL(/auth_error=invalid_callback/);
 const status=await page.evaluate(async()=>
  (await fetch('/api/marketing/me',{credentials:'same-origin'})).status);
 expect(status).toBe(401);
 const cookies=await page.context().cookies(frontend);
 expect(cookies.some(c=>c.name===SESSION_COOKIE)).toBe(false);
});
test('T1D-004 code is single use and PKCE mismatch denies token issuance',async({request})=>{
 const verifier='v'.repeat(43),challenge=createHash('sha256')
  .update(verifier).digest('base64url');
 const auth=new URL(issuer+'/authorize');
 for(const [k,v] of Object.entries({response_type:'code',client_id:clientId,
  redirect_uri:redirect,code_challenge_method:'S256',code_challenge:challenge,
  scope:'openid profile api://medsol-r3y/marketing',
  state:'s'.repeat(43),nonce:'n'.repeat(43)}))
  auth.searchParams.set(k,v);
 const result=await request.get(auth.href,{maxRedirects:0});
 expect(result.status()).toBe(302);
 const target=new URL(result.headers().location!);
 const code=target.searchParams.get('code');
 expect(code).toBeTruthy();
 const form={grant_type:'authorization_code',client_id:clientId,
  client_secret:'r3y-disposable-client-secret-ci-only',redirect_uri:redirect,
  code:code!,code_verifier:'x'.repeat(43)};
 const denied=await request.post(issuer+'/token',{form});
 expect(denied.status()).toBe(400);
 const replay=await request.post(issuer+'/token',{form:{...form,code_verifier:verifier}});
 expect(replay.status()).toBe(400);
});
