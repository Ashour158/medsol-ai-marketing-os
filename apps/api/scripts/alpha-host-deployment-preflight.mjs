#!/usr/bin/env node
/** Configuration-only preflight for the existing T1E staging Compose authority.
 * Never pulls, starts, migrates, changes firewall rules or prints resolved secrets.
 * Run from the reviewed checkout on the authorized host, not from CI fixtures.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {realpathSync,statSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {pinnedStagingIssuer} from '@medsol/contracts';
import {assertStagingDatabaseDsn} from './t1g-staging-db-policy.mjs';
const fail=reason=>{throw Error('ALPHA_HOST_CONFIG_BLOCKED: '+reason)};
const imagePattern=/^[-.a-zA-Z0-9/:_]+@sha256:[a-f0-9]{64}$/;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const flags=['MARKETING_EXTERNAL_EFFECTS_ENABLED','MARKETING_AI_REASONING_ENABLED','MARKETING_REAL_EMAIL_ENABLED',
 'MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED','MARKETING_LIVE_DELIVERY_ENABLED','MARKETING_PROVIDER_EGRESS_ENABLED',
 'MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED','MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED'];
const fixtureKeys=['MARKETING_R3Y_STAGING_CI_ONLY','MARKETING_DISPOSABLE_OIDC_CI_ONLY','MARKETING_T1E_STAGING_CI_ONLY',
 'MARKETING_BOOTSTRAP_TOKEN','MARKETING_BOOTSTRAP_ORGANIZATION_ID','MARKETING_STAGING_MAINTENANCE_DB_URL',
 'MARKETING_OFFLINE_OIDC_CLIENT_SECRET','NODE_TLS_REJECT_UNAUTHORIZED','CI','GITHUB_ACTIONS'];
export function assertAlphaCompose(config,reviewed){
 if(!reviewed||!imagePattern.test(reviewed.api??'')||!imagePattern.test(reviewed.web??'')||reviewed.api===reviewed.web)
  fail('Two distinct reviewed immutable registry image references required');
 if(Object.keys(config?.services??{}).sort().join(',')!=='api,web')fail('Expected exactly API and web services');
 const {api,web}=config.services;
 for(const [name,s] of Object.entries({api,web})){
  if(s.image!==reviewed[name]||s.build||s.privileged||s.network_mode||s.pid||s.ipc||s.devices?.length||s.volumes?.length||
     s.cap_add?.length||s.command||s.entrypoint||s.user||s.extra_hosts?.length||s.secrets?.length||s.configs?.length||
     s.read_only!==true||!s.cap_drop?.includes('ALL')||!s.security_opt?.includes('no-new-privileges:true')||
     Object.keys(s.networks??{}).join(',')!=='private')
   fail(name+' differs from reviewed private hardened topology');
  const env=s.environment??{};
  if(env.NODE_ENV!=='production'||fixtureKeys.some(k=>!!env[k])||flags.some(k=>env[k]!=='false')||
     env.MARKETING_MODEL_PROVIDER!=='disabled')
   fail(name+' violates offline non-CI runtime policy');
  try{pinnedStagingIssuer(env);}catch{fail(name+' staging identity policy rejected')}
 }
 if(api.ports?.length||api.environment.PORT!=='3001'||web.environment.PORT!=='3000')
  fail('API must not publish ports');
 if(!Array.isArray(web.ports)||web.ports.length!==1||web.ports[0].host_ip!=='127.0.0.1'||
    Number(web.ports[0].target)!==3000||web.ports[0].protocol!=='tcp'||
    !/^\d+$/.test(String(web.ports[0].published))||Number(web.ports[0].published)<1024||Number(web.ports[0].published)>65535)
  fail('Frontend must expose only an unprivileged loopback port');
 if(web.environment.MARKETING_API_INTERNAL_URL!=='http://api:3001'||web.environment.DATABASE_URL)
  fail('Web must use private API and must not receive DB credentials');
 try{assertStagingDatabaseDsn(api.environment.DATABASE_URL);}catch{fail('API database TLS or dedicated-role policy rejected')}
 for(const key of ['MARKETING_OIDC_ISSUER','MARKETING_STAGING_OIDC_TRUSTED_ISSUER','MARKETING_OIDC_JWKS_URL','MARKETING_OIDC_CLIENT_ID','MARKETING_OIDC_AUDIENCE','MARKETING_PUBLIC_ORIGIN'])
  if(!api.environment[key]||api.environment[key]!==web.environment[key])fail('API/web identity configuration disagrees: '+key);
 let origin;try{origin=new URL(web.environment.MARKETING_PUBLIC_ORIGIN)}catch{fail('Invalid frontend origin')}
 if(origin.protocol!=='https:'||origin.href!==origin.origin+'/'||origin.username||origin.password||
    ['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.origin===new URL(web.environment.MARKETING_OIDC_ISSUER).origin)
  fail('Separate trusted non-loopback frontend HTTPS origin required');
 const keys=(web.environment.MARKETING_SESSION_SECRETS||web.environment.MARKETING_SESSION_SECRET||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!keys.length||keys.length>3||new Set(keys).size!==keys.length||keys.some(s=>Buffer.from(s,'base64url').length!==32||Buffer.from(s,'base64url').toString('base64url')!==s))
  fail('Invalid web session key rotation configuration');
 if(api.environment.MARKETING_SESSION_SECRET||api.environment.MARKETING_SESSION_SECRETS)
  fail('Web session keys must remain in frontend only');
 return {schema:'medsol-alpha-phase2-host-config-v1',verdict:'CONFIG_VALIDATED_NOT_DEPLOYED',
  images:reviewed,offlineEffects:true,privateApi:true,privateFrontendLoopback:true,
  configuredSignedOidc:true,configuredDatabaseTls:true,actualHostEgressVerified:false,
  actualDatabaseRoleVerified:false,actualTlsVerified:false,actualOperatorAuthenticated:false,
  actualDeploymentObserved:false,independentQaSignatures:0,releaseVerdict:'NO_GO'};
}
function privateFile(path){
 if(!isAbsolute(path??''))fail('Private runtime file must have absolute path');
 const real=realpathSync(path),stat=statSync(real),rel=relative(root,real);
 if(!rel||(!rel.startsWith('..'+'/')&&rel!=='..')||!stat.isFile()||(stat.mode&0o077)!==0||
    (typeof process.getuid==='function'&&stat.uid!==process.getuid()))
  fail('Runtime file must be outside checkout, owned by operator, with mode 0600 or stricter');
 return real;
}
function command(args,env){
 const result=spawnSync('docker',args,{cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000});
 if(result.status!==0)fail('Docker configuration or inspection failed (raw output withheld)');
 return result.stdout;
}
function main(){
 if(process.env.CI==='true'||process.env.GITHUB_ACTIONS==='true')fail('Host preflight is not a CI deployment');
 const reviewed={api:process.env.MARKETING_STAGING_API_IMAGE,web:process.env.MARKETING_STAGING_WEB_IMAGE};
 const apiFile=privateFile(process.env.MARKETING_STAGING_API_ENV_FILE),webFile=privateFile(process.env.MARKETING_STAGING_WEB_ENV_FILE);
 if(apiFile===webFile)fail('API and web require separate private runtime files');
 const env={...process.env,MARKETING_STAGING_API_ENV_FILE:apiFile,MARKETING_STAGING_WEB_ENV_FILE:webFile};
 // Explicit Compose file and empty interpolation file; do not consume checkout .env.
 const raw=command(['compose','--env-file','/dev/null','-f',resolve(root,'infra/staging/compose.yml'),'config','--format','json'],env);
 let config;try{config=JSON.parse(raw)}catch{fail('Malformed resolved Compose configuration')}
 const result=assertAlphaCompose(config,reviewed);
 // Inspect locally available digest references, never pull or publish here.
 for(const ref of Object.values(reviewed)){
  let info;try{info=JSON.parse(command(['image','inspect',ref],env))[0]}catch{fail('Reviewed image not available locally')}
  if(!info?.RepoDigests?.includes(ref)||info.Config?.User!=='65532:65532')fail('Local digest or runtime user mismatch');
 }
 const evidence={...result,localImageReferencesVerified:true,observedAt:new Date().toISOString(),
  configEvidenceHash:'sha256:'+createHash('sha256').update(JSON.stringify(result)).digest('hex')};
 const output=process.argv[2];
 if(output){
  if(!isAbsolute(output)||!output.endsWith('.json'))fail('Explicit absolute JSON evidence path required');
  const parent=realpathSync(dirname(output)),rel=relative(root,parent);
  if(!rel||(!rel.startsWith('../')&&rel!=='..'))fail('Evidence must remain outside checkout');
  writeFileSync(output,JSON.stringify(evidence,null,2)+'\n',{mode:0o600,flag:'wx'});
 }
 console.log(JSON.stringify(evidence,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main()}catch(e){console.error(e.message.startsWith('ALPHA_HOST_CONFIG_BLOCKED:')?e.message:'ALPHA_HOST_CONFIG_BLOCKED: private file or host inspection failed');process.exitCode=1}}
