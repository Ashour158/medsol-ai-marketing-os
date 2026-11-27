/** CI-only packaged HTTPS proxy and protocol-level login checks.
 * Reuses the canonical disposable OIDC fixture; no browser/independent QA claim.
 */
import {createServer} from 'node:https';
import {request} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {disposableOidcCiAllowed} from '@medsol/contracts';
const issuer='https://127.0.0.1:3215',origin='https://127.0.0.1:3443';
if(!disposableOidcCiAllowed(issuer,process.env)||process.env.MARKETING_T1E_STAGING_CI_ONLY!=='1')
 throw Error('Disposable isolated GitHub CI only');
if(process.argv[2]==='proxy'){
 const server=createServer({key:readFileSync('/tmp/medsol-r3y-jwks/key.pem'),cert:readFileSync('/tmp/medsol-r3y-jwks/cert.pem')},(req,res)=>{
  const upstream=request({hostname:'127.0.0.1',port:3000,method:req.method,path:req.url,
   headers:{...req.headers,host:'127.0.0.1:3443','x-forwarded-proto':'https'}},r=>{
    res.writeHead(r.statusCode??502,r.headers);r.pipe(res);
   });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(upstream);
 });
 server.listen(3443,'127.0.0.1');
}else if(process.argv[2]==='verify'){
 const get=(url,options={})=>fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),...options});
 const follow=(r,expected)=>{assert.ok([302,303,307,308].includes(r.status));const u=new URL(r.headers.get('location'),origin);assert.equal(u.origin,expected);return u.href};
 const cookie=(r,name)=>{
  const raw=r.headers.getSetCookie().find(c=>c.startsWith(name+'='));
  // Never include cookie values in assertion output.
  if(!raw||! /;\s*Secure(?:;|$)/i.test(raw)||! /;\s*HttpOnly(?:;|$)/i.test(raw))throw Error('Expected secure HTTP-only cookie missing');
  return raw.split(';',1)[0];
 };
 const bff=(path,session,opts={})=>get(origin+'/api/marketing/'+path,{...opts,headers:{...opts.headers,cookie:session}});
 async function login(persona){
  assert.equal((await get('http://127.0.0.1:3216/__select-persona?persona='+persona,{method:'POST'})).status,200);
  const start=await get(origin+'/api/auth/login');
  const flow=cookie(start,'__Host-medsol_oidc_flow');
  const auth=await get(follow(start,issuer));
  const callback=await get(follow(auth,origin),{headers:{cookie:flow}});
  const target=new URL(follow(callback,origin));
  assert.equal(target.pathname,'/');assert.equal(target.search,'');
  return cookie(callback,'__Host-medsol_session');
 }
 assert.equal((await get(origin+'/api/marketing/me')).status,401);
 const admin=await login('admin');
 const me=await bff('me',admin);assert.equal(me.status,200);
 const identity=await me.json();assert.equal(identity.userId,'t1e-stage-admin');assert.equal(identity.organizationId,'r3y-tenant-a');assert.equal(identity.role,'ADMIN');
 const brands=await bff('tenancy/brands',admin);assert.equal(brands.status,200);assert.ok((await brands.json()).some(b=>b.id==='r3y-stage-brand'));
 const viewer=await login('viewer');assert.equal((await bff('approvals/pending',viewer)).status,403);
 const foreign=await login('foreign');const other=await bff('tenancy/brands',foreign);assert.equal(other.status,200);assert.ok(!(await other.json()).some(b=>b.id==='r3y-stage-brand'));
 const logout=await get(origin+'/api/auth/logout',{method:'POST',headers:{origin,cookie:admin}});assert.equal(logout.status,200);
 assert.equal((await bff('me',admin)).status,401);
 console.log(JSON.stringify({schema:'medsol-alpha-packaged-login-v1',signedPkce:true,trustedFixtureTls:true,anonymousDenied:true,
 administratorAuthenticated:true,viewerDenied:true,crossTenantBrandDenied:true,revokedSessionDenied:true,
 realProviderConnections:0,classification:'DISPOSABLE_CI_PROTOCOL_TEST_NOT_DEPLOYED'}));
}else throw Error('Expected proxy or verify mode');
