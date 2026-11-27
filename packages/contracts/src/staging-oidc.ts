import {disposableOidcCiAllowed} from './disposable-oidc.js';

/** Identity mapping only. Never creates a user, tenant or a session. */
export function stagingOidcSubject(issuer:string,sub:unknown):string{
 if(typeof sub!=='string'||sub.length<1||sub.length>256||sub.trim()!==sub)
  throw new Error('A nonempty verified OIDC sub is mandatory');
 // Escaped unambiguous issuer/sub binding. Contract code is browser-safe:
 // never import Node crypto into the client-shared contracts package.
 const result='staging-oidc:'+encodeURIComponent(issuer)+'|'+encodeURIComponent(sub);
 if(result.length>640)throw new Error('OIDC issuer and sub exceed identity index budget');
 return result;
}
export type IdentityProvider='ENTRA'|'STAGING_OIDC';
export function marketingIdentityProvider(raw:unknown):IdentityProvider{
 if(raw===undefined||raw===null||raw===''||raw==='ENTRA')return 'ENTRA';
 if(raw==='STAGING_OIDC')return 'STAGING_OIDC';
 throw new Error('Unsupported Marketing identity provider');
}
export function pinnedStagingIssuer(env:Readonly<Record<string,string|undefined>>):string{
 if(marketingIdentityProvider(env.MARKETING_IDENTITY_PROVIDER)!=='STAGING_OIDC')
  throw new Error('Staging OIDC is not selected');
 const required:Record<string,string>={
  MARKETING_DEPLOYMENT_ENV:'staging',
  MARKETING_STAGING_OIDC_ENABLED:'OFFLINE_OPERATOR_TEST_ONLY',
  MARKETING_AUTH_MODE:'oidc',
  MARKETING_TENANT_RESOLUTION_MODE:'SIGNED_OIDC_CLAIM',
  MARKETING_EXTERNAL_EFFECTS_ENABLED:'false',
  MARKETING_REAL_EMAIL_ENABLED:'false',
  MARKETING_AI_REASONING_ENABLED:'false'
 };
 for(const [key,value] of Object.entries(required))
  if(env[key]!==value)throw new Error('Staging OIDC requires '+key+'='+value);
 if(env.MARKETING_BOOTSTRAP_ORGANIZATION_ID||env.MARKETING_BOOTSTRAP_TOKEN)
  throw new Error('Staging OIDC cannot use shared tenant or bootstrap credentials');
 for(const key of [
  'MARKETING_ENTRA_CLIENT_SECRET','OPENAI_API_KEY','ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY','GEMINI_API_KEY','MARKETING_ANTHROPIC_API_KEY','MARKETING_GEMINI_API_KEY','META_ACCESS_TOKEN',
  'FACEBOOK_ACCESS_TOKEN','LINKEDIN_ACCESS_TOKEN','SMTP_PASSWORD',
  'SENDGRID_API_KEY','MAILGUN_API_KEY','MARKETING_PROVIDER_CREDENTIALS_JSON',
  'MARKETING_INCIDENT_WEBHOOK_URL','MARKETING_INCIDENT_WEBHOOK_HMAC_SECRET'
 ])if(env[key])throw new Error('Staging OIDC rejects external provider credentials: '+key);
 for(const key of [
  'MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED','MARKETING_LIVE_DELIVERY_ENABLED',
  'MARKETING_PROVIDER_EGRESS_ENABLED','MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED',
  'MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED'
 ])if(env[key]&&env[key]!=='false')throw new Error('Staging OIDC forbids live effects: '+key);
 const modelProvider=env.MARKETING_MODEL_PROVIDER??'disabled';
 if(!['disabled','simulation'].includes(modelProvider))
  throw new Error('Staging OIDC permits only disabled or simulated model adapters');
 const issuer=env.MARKETING_OIDC_ISSUER??'';
 if(env.MARKETING_STAGING_OIDC_TRUSTED_ISSUER!==issuer||!issuer)
  throw new Error('Staging OIDC issuer must match independently pinned trusted issuer');
 let url:URL,jwks:URL;
 try{url=new URL(issuer);jwks=new URL(env.MARKETING_OIDC_JWKS_URL??'');}
 catch{throw new Error('Staging OIDC issuer or JWKS URL malformed');}
 if(url.protocol!=='https:'||jwks.protocol!=='https:'||
    url.username||url.password||url.search||url.hash||
    jwks.username||jwks.password||jwks.search||jwks.hash||
    url.origin!==jwks.origin||!jwks.pathname.includes('/'))
  throw new Error('Staging OIDC and JWKS require pinned same-origin HTTPS');
 const ci=disposableOidcCiAllowed(issuer,env)&&
  env.MARKETING_T1E_STAGING_CI_ONLY==='1';
 if(!ci&&(
   url.hostname==='localhost'||url.hostname==='127.0.0.1'||
   url.hostname==='::1'||!url.hostname.includes('.')||
   /\.(?:local|internal|test|invalid)$/.test(url.hostname)||
   /^[\d.]+$/.test(url.hostname)
 ))throw new Error('Non-CI staging requires a trusted HTTPS issuer hostname');
 if(!env.MARKETING_OIDC_AUDIENCE||!env.MARKETING_OIDC_CLIENT_ID)
  throw new Error('Staging OIDC requires explicit audience and client ID');
 const clientSecret=env.MARKETING_STAGING_OIDC_CLIENT_SECRET;
 if(!clientSecret||clientSecret.length<32)
  throw new Error('Staging OIDC requires a dedicated strong confidential client secret');
 return issuer;
}
export function assertStagingDiscoveryUrl(issuer:string,endpoint:unknown):string{
 if(typeof endpoint!=='string')throw new Error('Staging discovery endpoint missing');
 let a:URL,b:URL;
 try{a=new URL(issuer);b=new URL(endpoint);}
 catch{throw new Error('Staging discovery endpoint malformed');}
 if(b.protocol!=='https:'||b.origin!==a.origin||b.username||b.password||
    b.hash||b.search||!b.pathname.startsWith(a.pathname.replace(/\/$/,'')+'/'))
  throw new Error('Staging discovery endpoints must remain under pinned issuer');
 return b.href;
}
export function hasOidcScope(payload:Record<string,unknown>,expected:string):boolean{
 return [payload.scp,payload.scope].some(value=>typeof value==='string'&&
  value.split(/\s+/).includes(expected));
}
