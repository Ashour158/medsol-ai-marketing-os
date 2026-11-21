#!/usr/bin/env node
/** Offline staging CONFIG preflight only; no network/DB or certification. */
import {pinnedStagingIssuer,disposableOidcCiAllowed} from '@medsol/contracts';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const env=process.env;
const fail=x=>{throw Error('T1E_STAGING_CONFIG_BLOCKED: '+x);};
let issuer;
try{issuer=pinnedStagingIssuer(env);}
catch(e){fail(e instanceof Error?e.message:'Staging identity policy denied');}
const ci=disposableOidcCiAllowed(issuer,env)&&
 env.MARKETING_T1E_STAGING_CI_ONLY==='1';
let origin,api;
try{
 origin=new URL(env.MARKETING_PUBLIC_ORIGIN??'');
 api=new URL(env.MARKETING_API_INTERNAL_URL??'');
}catch{fail('Explicit frontend origin and internal API URL required');}
if(origin.protocol!=='https:'||origin.username||origin.password||
 origin.search||origin.hash||origin.pathname!=='/')
 fail('Public staging must be an exact HTTPS origin');
if(origin.origin===new URL(issuer).origin)
 fail('Issuer and frontend must have separate origins');
if(!ci&&(origin.hostname==='127.0.0.1'||origin.hostname==='localhost'))
 fail('Real staging origin cannot be loopback');
if(!['http:','https:'].includes(api.protocol)||api.username||api.password||
 api.search||api.hash||api.pathname!=='/')
 fail('Private API URL must be a clean origin');
if(!ci&&!['localhost','127.0.0.1','api'].includes(api.hostname)&&
 !api.hostname.endsWith('.internal'))
 fail('API URL must remain an approved private backend hostname');
const keys=(env.MARKETING_SESSION_SECRETS||
 env.MARKETING_SESSION_SECRET||'').split(',').map(s=>s.trim()).filter(Boolean);
if(!keys.length||keys.length>3||keys.some(s=>{
 const b=Buffer.from(s,'base64url');
 return b.length!==32||b.toString('base64url')!==s;
})||new Set(keys).size!==keys.length)
 fail('Require one to three DISTINCT 32-byte base64url session keys');
if(env.DATABASE_URL){
 let db;
 try{db=new URL(env.DATABASE_URL);}catch{fail('Malformed database URL');}
 if(db.protocol!=='postgresql:'||!db.username||!db.password)
  fail('PostgreSQL runtime DSN invalid');
 // Runtime staging must never silently negotiate plaintext or redirect to
 // an unreviewed host. CI's disposable database is intentionally exempt.
 if(!ci){
  const ssl=(db.searchParams.get('sslmode')??'').toLowerCase();
  if(ssl!=='verify-full'||db.searchParams.getAll('sslmode').length!==1)
   fail('Staging PostgreSQL requires verified TLS (sslmode=verify-full or verify-ca)');
  if(!db.hostname||['localhost','127.0.0.1','0.0.0.0'].includes(db.hostname))
   fail('Staging PostgreSQL must use a dedicated non-loopback endpoint');
  if(db.searchParams.has('sslrootcert')&&db.searchParams.getAll('sslrootcert').length!==1)
   fail('Staging PostgreSQL must not supply duplicate trust-anchor settings');
  if(db.searchParams.has('options')||db.searchParams.has('service')||
     db.searchParams.has('host')||db.searchParams.has('hostaddr'))
   fail('Staging PostgreSQL forbids connection-routing and session override parameters');
 }
 if(!ci&&(!/staging/i.test(db.pathname)||['postgres','medsol','marketing_test'].includes(db.username)))
  fail('Stage DB must use a dedicated staging DB and application role');
}
if(!ci&&env.NODE_ENV!=='production')
 fail('Real operator staging must run production-compiled services');
const images=['MARKETING_STAGING_API_IMAGE','MARKETING_STAGING_WEB_IMAGE'];
if(!ci)for(const key of images)
 if(!/^[-.a-zA-Z0-9/:_]+@sha256:[a-f0-9]{64}$/.test(env[key]??''))
  fail('Immutable SHA256 image required: '+key);
const manifest={
 schema:'medsol-t1e-operator-staging-config-preflight-v1',
 verdict:'CONFIG_VALIDATION_PASSED_NOT_DEPLOYED',
 releaseVerdict:'NOT_CERTIFIED',
 mode:ci?'DISPOSABLE_CI_ONLY':'SELF_HOSTED_STAGING_OPERATOR',
 issuerPinned:true,stagingSignedOrganizationRequired:true,
 noAutoProvisioning:true,productionEntraUnchanged:true,
 externalProviderEffectsAllowed:false,configuredPublicOrigin:origin.origin,
 actualTlsEndpointProbed:false,realServerStarted:false,
 actualRestrictedDatabaseRoleVerified:false,
 actualOperatorAuthenticated:false,independentQaSignatures:0,
 immutableImagesConfigured:!ci,
 digest:'sha256:'+createHash('sha256').update(JSON.stringify({
  mode:ci?'CI':'STAGING',issuer,origin:origin.origin,apiOrigin:api.origin,
  images:ci?[]:images.map(k=>env[k])
 })).digest('hex')
};
const i=process.argv.indexOf('--output');
if(i!==-1){
 const path=process.argv[i+1];
 if(!path||!path.endsWith('.json'))fail('Explicit JSON evidence path required');
 writeFileSync(path,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
}
process.stdout.write(JSON.stringify(manifest,null,2)+'\n');
