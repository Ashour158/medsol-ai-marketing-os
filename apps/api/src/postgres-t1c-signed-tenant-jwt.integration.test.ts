import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {BootstrapAuthGuard} from './bootstrap-auth.guard.js';
import {AuthSessionService} from './auth-session.service.js';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';

/** Real RSA-signed JWT signature/audience/issuer/scope checks and REAL PostgreSQL
 * membership/session/role transactions. Only remote JWKS retrieval is replaced
 * with an isolated in-memory public JWK set. No real identity provider is used.
 */
const localPublicJwks=vi.hoisted(()=>({value:null as unknown}));
vi.mock('jose',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('jose')>();
 return{...actual,createRemoteJWKSet:()=>actual.createLocalJWKSet(
  localPublicJwks.value as Parameters<typeof actual.createLocalJWKSet>[0])};
});
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const env={...process.env};
const db=new PrismaClient();
const tenant='11111111-1111-4111-8111-111111111111';
const issuer='https://login.microsoftonline.com/'+tenant+'/v2.0';
const audience='api://medsol-t1c';
const cfg={issuer,audience,jwksUrl:'https://synthetic.invalid/jwks/t1c'};
const orgA='t1c-tenant-a-'+randomUUID(),orgB='t1c-tenant-b-'+randomUUID();
const oidA='22222222-2222-4222-8222-222222222222';
const oidB='33333333-3333-4333-8333-333333333333';
const userA=randomUUID(),userB=randomUUID();
const subject=(oid:string)=>'entra:'+tenant+':'+oid;
const ctx=(req:unknown):any=>({switchToHttp:()=>({getRequest:()=>req})});
let guard:BootstrapAuthGuard,sessionA:string,sessionB:string;
let privateKey:Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
async function signedToken(input:{oid?:string;organizationId?:unknown;scope?:string;
 audience?:string;issuer?:string;includeOrg?:boolean;expires?:string|number}={}):Promise<string>{
 const claims:Record<string,unknown>={tid:tenant,oid:input.oid??oidA,
  scp:input.scope??'marketing'};
 if(input.includeOrg!==false)claims.marketing_org_id=
  input.organizationId===undefined?orgA:input.organizationId;
 return new SignJWT(claims)
  .setProtectedHeader({alg:'RS256',kid:'t1c-disposable-key',typ:'JWT'})
  .setIssuer(input.issuer??issuer).setAudience(input.audience??audience)
  .setIssuedAt().setExpirationTime(input.expires??'10m')
  .sign(privateKey);
}
function req(token:string,org:string,sessionId:string,body?:{organizationId:string}){
 return{method:body?'POST':'GET',url:body?'/marketing/requests':'/marketing/overview',
  headers:{authorization:'Bearer '+token,'x-organization-id':org,
   'x-marketing-session-id':sessionId} as Record<string,unknown>,body};
}
describe.skipIf(!enabled)('T1C actual signed tenant JWT + real PostgreSQL IAM security acceptance',()=>{
 beforeAll(async()=>{
  process.env.MARKETING_AUTH_MODE='oidc';
  process.env.MARKETING_TENANT_RESOLUTION_MODE='SIGNED_OIDC_CLAIM';
  delete process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
  process.env.MARKETING_ENTRA_TENANT_ID=tenant;
  process.env.MARKETING_ENTRA_API_SCOPE='api://medsol-t1c/marketing';
  process.env.MARKETING_OIDC_ISSUER=issuer;
  process.env.MARKETING_OIDC_AUDIENCE=audience;
  process.env.MARKETING_OIDC_JWKS_URL=cfg.jwksUrl;
  process.env.MARKETING_REQUIRE_TENANT_ROLE='false';
  const keys=await generateKeyPair('RS256');
  privateKey=keys.privateKey;
  const jwk=await exportJWK(keys.publicKey);
  localPublicJwks.value={keys:[{...jwk,kid:'t1c-disposable-key',
   use:'sig',alg:'RS256'}]};
  await db.$connect();
  await db.organization.createMany({data:[
   {id:orgA,name:'T1C synthetic A'},{id:orgB,name:'T1C synthetic B'}]});
  await db.user.createMany({data:[
   {id:userA,organizationId:orgA,name:'T1C Admin A',role:'ADMIN',
    email:'t1c-a-'+randomUUID()+'@example.invalid',oidcSubject:subject(oidA)},
   {id:userB,organizationId:orgB,name:'T1C Admin B',role:'ADMIN',
    email:'t1c-b-'+randomUUID()+'@example.invalid',oidcSubject:subject(oidB)}]});
  const sessions=new AuthSessionService(db as any);
  sessionA=(await sessions.register(orgA,userA,Date.now()+600000)).sessionId;
  sessionB=(await sessions.register(orgB,userB,Date.now()+600000)).sessionId;
  guard=new BootstrapAuthGuard(db as any,new TenantRolePolicyService(db as any));
 },60000);
 afterAll(async()=>{process.env={...env};await db.$disconnect();});
 it('allows the two individually signed and provisioned organizations without shared tenant ID',async()=>{
  const a=req(await signedToken(),orgA,sessionA);
  expect(await guard.canActivate(ctx(a))).toBe(true);
  expect(a.headers['x-organization-id']).toBe(orgA);
  const b=req(await signedToken({oid:oidB,organizationId:orgB}),orgB,sessionB);
  expect(await guard.canActivate(ctx(b))).toBe(true);
  expect(b.headers['x-organization-id']).toBe(orgB);
 });
 it('blocks a forged body and header even when the underlying token signature is valid',async()=>{
  const token=await signedToken();
  await expect(guard.canActivate(ctx(req(token,orgB,sessionA))))
   .rejects.toThrow('Cross-tenant');
  const altered=req(token,orgA,sessionA,{organizationId:orgB});
  await expect(guard.canActivate(ctx(altered))).rejects.toThrow('Cross-tenant');
 });
 it('rejects cross-organization replay of genuine signed token or session',async()=>{
  await expect(guard.canActivate(ctx(req(await signedToken(),orgA,sessionB))))
   .rejects.toThrow('Session expired or revoked');
  await expect(guard.canActivate(ctx(req(
   await signedToken({oid:oidA,organizationId:orgB}),orgB,sessionB))))
   .rejects.toThrow('not active');
 });
 it('rejects missing, malformed, and attacker-selected signed organization claims',async()=>{
  for(const options of [{includeOrg:false},{organizationId:'../invalid'},
   {organizationId:['tenant-a','tenant-b']}]){
   await expect(guard.canActivate(ctx(req(await signedToken(options),orgA,sessionA))))
    .rejects.toThrow('Verified OIDC organization context');
  }
 });
 it('rejects altered signatures, wrong audience, wrong issuer, and missing scope',async()=>{
  const valid=await signedToken();
  const forged=valid.slice(0,-3)+'abc';
  for(const token of [forged,await signedToken({audience:'api://wrong'}),
   await signedToken({issuer:'https://spoofed.invalid/v2'}),
   await signedToken({scope:'User.Read'})])
   await expect(guard.canActivate(ctx(req(token,orgA,sessionA)))).rejects.toThrow();
 });
 it('disallows an expired signed token before database authentication',async()=>{
  await expect(guard.canActivate(ctx(req(
   await signedToken({expires:Math.floor(Date.now()/1000)-20}),orgA,sessionA)))).rejects.toThrow('Invalid or expired');
 });
 it('denies a revoked server session despite a still-valid signed token',async()=>{
  const sessions=new AuthSessionService(db as any);
  const existing=await sessions.register(orgA,userA,Date.now()+500000);
  await sessions.revoke(orgA,userA,existing.sessionId);
  await expect(guard.canActivate(ctx(req(await signedToken(),orgA,existing.sessionId))))
   .rejects.toThrow('Session expired or revoked');
 });
 it('never needs or accesses a real provider credential to authenticate',async()=>{
  for(const org of [orgA,orgB])
   expect(await db.providerCredential.count({where:{organizationId:org}})).toBe(0);
 });
});
