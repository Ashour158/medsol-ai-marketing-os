/**
 * R3-Y disposable locally signed JWT fixture, not Microsoft Entra.
 * Real Nest production OIDC verifier and RLS/role/session guards stay intact;
 * the JWKS is an HTTPS loopback test key, never production trust.
 * No real credentials, federation, network provider or internet publishing.
 */
import {createServer as httpsServer} from 'node:https';
import {createServer as httpServer} from 'node:http';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SignJWT} from 'jose';
const fail=(s)=>{throw Error('R3Y_FIXTURE_BLOCKED: '+s)};
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
   process.env.MARKETING_R3Y_STAGING_CI_ONLY!=='1'||process.env.MARKETING_DB_INTEGRATION!=='1')
 fail('Only authorized disposable GitHub CI may launch synthetic OIDC');
const db=new URL(process.env.DATABASE_URL??'http://invalid');
if(db.hostname!=='localhost'||db.pathname!=='/marketing_test'||db.username!=='marketing_test')
 fail('No live database allowed');
if(process.env.OPENAI_API_KEY||process.env.MARKETING_ENTRA_CLIENT_SECRET||process.env.META_ACCESS_TOKEN)
 fail('Real provider credentials forbidden');
const tenant='11111111-1111-4111-8111-111111111111';
const issuer='https://login.microsoftonline.com/'+tenant+'/v2.0';
const aud='api://medsol-r3y',scope='marketing';
const people={
 admin:'22222222-2222-4222-8222-222222222222',
 reviewer:'33333333-3333-4333-8333-333333333333',
 viewer:'44444444-4444-4444-8444-444444444444',
 foreign:'55555555-5555-4555-8555-555555555555'
};
const kp=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=kp.publicKey.export({format:'jwk'});
const publicJwks={keys:[{...jwk,alg:'RS256',kid:'r3y-disposable-local-jwks-1',use:'sig'}]};
const certDir='/tmp/medsol-r3y-jwks';
const tls=httpsServer({
 key:readFileSync(certDir+'/key.pem'),cert:readFileSync(certDir+'/cert.pem')
},(req,res)=>{
 if(req.url!=='/.well-known/jwks.json'||req.method!=='GET'){
  res.writeHead(404);return res.end('not found');
 }
 res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify(publicJwks));
});
tls.listen(3215,'127.0.0.1');
const ctl=httpServer(async(req,res)=>{
 const url=new URL(req.url??'/', 'http://127.0.0.1:3216');
 if(url.pathname==='/__health'){
  res.writeHead(200,{'content-type':'application/json'});return res.end('{"ok":true,"testOnly":true}');
 }
 if(url.pathname!=='/__issue'||req.method!=='POST'){
  res.writeHead(404);return res.end('not found');
 }
 const persona=url.searchParams.get('persona');
 if(!persona||!(persona in people)){res.writeHead(400);return res.end('unknown persona')}
 const oid=people[persona];
 let token;
 try{token=await new SignJWT({tid:tenant,oid,scp:scope,ver:'2.0'})
  .setProtectedHeader({alg:'RS256',kid:'r3y-disposable-local-jwks-1',typ:'JWT'})
  .setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime('15m')
  .sign(kp.privateKey)}catch{res.writeHead(500);return res.end('signing failed')}
 res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({token,tenant,subject:'entra:'+tenant+':'+oid,persona,
   realEntraIssuerContacted:false,localSyntheticSignedIdentity:true}));
});
ctl.listen(3216,'127.0.0.1',()=>process.stdout.write('R3-Y signed local OIDC control and HTTPS JWKS ready\n'));
