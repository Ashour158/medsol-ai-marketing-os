/**
 * T1D: ephemeral loopback OIDC provider + original R3-Y control fixture.
 * CI only, disposable PostgreSQL only, no real Entra or external accounts.
 * Authorization-code exchange uses one-time code, PKCE S256, redirect
 * allowlist, nonce and a fixed confidential synthetic client credential.
 */
import {createServer as httpsServer} from 'node:https';
import {createServer as httpServer} from 'node:http';
import {createHash,generateKeyPairSync,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SignJWT} from 'jose';
const fail=(s)=>{throw Error('R3Y_FIXTURE_BLOCKED: '+s)};
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
   process.env.MARKETING_R3Y_STAGING_CI_ONLY!=='1'||
   process.env.MARKETING_DISPOSABLE_OIDC_CI_ONLY!=='1'||
   process.env.MARKETING_DB_INTEGRATION!=='1')
 fail('Only disposable GitHub Actions CI may launch local OIDC');
const db=new URL(process.env.DATABASE_URL??'http://invalid');
if(db.hostname!=='localhost'||db.pathname!=='/marketing_test'||db.username!=='marketing_test')
 fail('A clean ephemeral PostgreSQL database is mandatory');
if(process.env.OPENAI_API_KEY||process.env.ANTHROPIC_API_KEY||
   process.env.GEMINI_API_KEY||process.env.MARKETING_ENTRA_CLIENT_SECRET||
   process.env.META_ACCESS_TOKEN)
 fail('Real provider credentials forbidden');
const expected={MARKETING_EXTERNAL_EFFECTS_ENABLED:'false',
 MARKETING_AI_REASONING_ENABLED:'false',MARKETING_REAL_EMAIL_ENABLED:'false',
 MARKETING_AUTH_MODE:'oidc'};
for(const [k,v] of Object.entries(expected))if(process.env[k]&&process.env[k]!==v)
 fail('Incompatible external provider or authentication setting: '+k);
const issuer='https://127.0.0.1:3215';
const tenant='11111111-1111-4111-8111-111111111111';
const audience='api://medsol-r3y',scope='marketing';
const clientId='r3y-disposable-browser';
const secret='r3y-disposable-client-secret-ci-only';
const redirect='https://127.0.0.1:3443/api/auth/callback';
const people={
 admin:'22222222-2222-4222-8222-222222222222',
 reviewer:'33333333-3333-4333-8333-333333333333',
 viewer:'44444444-4444-4444-8444-444444444444',
 foreign:'55555555-5555-4555-8555-555555555555'
};
const kp=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=kp.publicKey.export({format:'jwk'});
const kid='r3y-disposable-local-jwks-1';
const publicJwks={keys:[{...jwk,alg:'RS256',kid,use:'sig'}]};
const certDir='/tmp/medsol-r3y-jwks';
const codes=new Map();
const json=(res,status,data)=>{res.writeHead(status,{
 'content-type':'application/json','cache-control':'no-store',
 'pragma':'no-cache','x-content-type-options':'nosniff'});
 res.end(JSON.stringify(data));};
const reject=(res,reason)=>json(res,400,{error:'invalid_request',reason});
const accessToken=async(oid)=>new SignJWT({tid:tenant,oid,scp:scope,ver:'2.0'})
 .setProtectedHeader({alg:'RS256',kid,typ:'JWT'})
 .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('15m')
 .sign(kp.privateKey);
const identityToken=async(oid,nonce)=>new SignJWT({tid:tenant,oid,
  nonce,sub:'disposable-r3y-'+oid,ver:'2.0'})
 .setProtectedHeader({alg:'RS256',kid,typ:'JWT'})
 .setIssuer(issuer).setAudience(clientId).setIssuedAt().setExpirationTime('15m')
 .sign(kp.privateKey);
const tls=httpsServer({
 key:readFileSync(certDir+'/key.pem'),cert:readFileSync(certDir+'/cert.pem')
},async(req,res)=>{
 const url=new URL(req.url??'/',issuer);
 if(req.method==='GET'&&url.pathname==='/__health')
  return json(res,200,{ok:true,disposableOnly:true});
 if(req.method==='GET'&&url.pathname==='/.well-known/jwks.json')
  return json(res,200,publicJwks);
 if(req.method==='GET'&&url.pathname==='/.well-known/openid-configuration')
  return json(res,200,{issuer,authorization_endpoint:issuer+'/authorize',
   token_endpoint:issuer+'/token',jwks_uri:issuer+'/.well-known/jwks.json',
   response_types_supported:['code'],grant_types_supported:['authorization_code'],
   id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256']});
 if(req.method==='GET'&&url.pathname==='/authorize'){
  const q=url.searchParams;
  if(q.get('response_type')!=='code'||q.get('client_id')!==clientId||
   q.get('redirect_uri')!==redirect||q.get('code_challenge_method')!=='S256'||
   !/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge')??'')||
   !/^[A-Za-z0-9_-]{32,160}$/.test(q.get('state')??'')||
   !/^[A-Za-z0-9_-]{32,160}$/.test(q.get('nonce')??'')||
   !['openid','api://medsol-r3y/marketing'].every(s=>
    (q.get('scope')??'').split(' ').includes(s)))
   return reject(res,'OIDC request invalid');
  const code=randomBytes(30).toString('base64url');
  codes.set(code,{challenge:q.get('code_challenge'),state:q.get('state'),
   nonce:q.get('nonce'),clientId,redirect,oid:people.admin,
   expiresAt:Date.now()+90000});
  const target=new URL(redirect);target.searchParams.set('code',code);
  target.searchParams.set('state',q.get('state'));
  res.writeHead(302,{location:target.href,'cache-control':'no-store'});
  return res.end();
 }
 if(req.method==='POST'&&url.pathname==='/token'){
  let raw='';
  for await(const part of req){
   raw+=part.toString();if(raw.length>8192)return reject(res,'Oversized token request');
  }
  const q=new URLSearchParams(raw),code=q.get('code')??'';
  const issued=codes.get(code);codes.delete(code); // consume before any validation
  if(!issued||issued.expiresAt<=Date.now()||
   q.get('grant_type')!=='authorization_code'||
   q.get('client_id')!==issued.clientId||
   q.get('client_secret')!==secret||
   q.get('redirect_uri')!==issued.redirect||
   !/^[A-Za-z0-9_-]{43,128}$/.test(q.get('code_verifier')??''))
   return reject(res,'Invalid or already consumed authorization code');
  const incoming=createHash('sha256').update(q.get('code_verifier')).digest('base64url');
  const expected=issued.challenge;
  if(!expected||!timingSafeEqual(Buffer.from(incoming),Buffer.from(expected)))
   return reject(res,'PKCE challenge mismatch');
  const [id_token,access_token]=await Promise.all([
   identityToken(issued.oid,issued.nonce),accessToken(issued.oid)]);
  return json(res,200,{token_type:'Bearer',expires_in:900,id_token,access_token});
 }
 return json(res,404,{error:'not_found'});
});
tls.listen(3215,'127.0.0.1');
const ctl=httpServer(async(req,res)=>{
 const url=new URL(req.url??'/', 'http://127.0.0.1:3216');
 if(url.pathname==='/__health')
  return json(res,200,{ok:true,testOnly:true});
 if(url.pathname!=='/__issue'||req.method!=='POST')
  return json(res,404,{error:'not_found'});
 const persona=url.searchParams.get('persona');
 if(!persona||!Object.hasOwn(people,persona))
  return reject(res,'unknown persona');
 const oid=people[persona];
 try{
  const token=await accessToken(oid);
  return json(res,200,{token,tenant,subject:'entra:'+tenant+':'+oid,
   persona,realEntraIssuerContacted:false,localSyntheticSignedIdentity:true});
 }catch{return json(res,500,{error:'signing_failed'});}
});
ctl.listen(3216,'127.0.0.1',()=>process.stdout.write(
 'T1D disposable PKCE OIDC and R3-Y signed JWT issuer ready; no provider accounts\n'));
