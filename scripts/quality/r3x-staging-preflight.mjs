#!/usr/bin/env node
/**
 * R3-X disposable staging preflight. Deliberately rejects non-CI, customer,
 * production or real-provider credentials; no network/DNS probes and no egress.
 */
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const FATAL_ENV=[
 'OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY',
 'AZURE_CLIENT_SECRET','AZURE_CLIENT_ID','MS_CLIENT_SECRET',
 'MARKETING_ENTRA_CLIENT_SECRET','MARKETING_ENTRA_TENANT_ID',
 'MARKETING_ENTRA_OIDC_ISSUER','MARKETING_ENTRA_OIDC_AUDIENCE',
 'MARKETING_OIDC_ISSUER','MARKETING_OIDC_JWKS_URL',
 'META_APP_SECRET','META_ACCESS_TOKEN','FACEBOOK_ACCESS_TOKEN',
 'INSTAGRAM_ACCESS_TOKEN','LINKEDIN_ACCESS_TOKEN','X_ACCESS_TOKEN',
 'TIKTOK_ACCESS_TOKEN','YOUTUBE_REFRESH_TOKEN',
 'SMTP_PASSWORD','SENDGRID_API_KEY','MAILGUN_API_KEY',
 'MARKETING_PROVIDER_CREDENTIALS_JSON','MARKETING_LIVE_PROVIDER_TOKEN',
 'MARKETING_RELEASE_TRUST_KEYS_JSON'
];
const BLOCKED_SWITCHES=[
 'MARKETING_EXTERNAL_EFFECTS_ENABLED','MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED',
 'MARKETING_LIVE_DELIVERY_ENABLED','MARKETING_PROVIDER_EGRESS_ENABLED',
 'MARKETING_AI_REASONING_ENABLED','MARKETING_REAL_EMAIL_ENABLED',
 'MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED','MARKETING_OIDC_LIVE_MODE'
];
const digest=(s)=>'sha256:'+createHash('sha256').update(s).digest('hex');
function bad(reason){throw new Error('R3X_STAGING_PREFLIGHT_BLOCKED: '+reason)}
export function assertDisposableStaging(environment,inventory){
 if(environment.CI!=='true'||environment.GITHUB_ACTIONS!=='true'||
    environment.MARKETING_R3X_PREFLIGHT_CI_ONLY!=='1'||
    environment.MARKETING_DB_INTEGRATION!=='1'||
    !/^\d{5,18}$/.test(environment.GITHUB_RUN_ID??''))
  bad('approved GitHub disposable integration run required');
 if(environment.NODE_ENV==='production'||environment.MARKETING_ENVIRONMENT==='production')
  bad('production process context not permitted');
 let u;
 try{u=new URL(environment.DATABASE_URL??'')}catch{bad('unparseable database URL')}
 if(u.protocol!=='postgresql:'||u.hostname!=='localhost'||u.port!=='5432'||
    u.pathname!=='/marketing_test'||u.username!=='marketing_test'||
    u.searchParams.get('schema')!=='public')
  bad('only exact GitHub CI local disposable PostgreSQL is allowed');
 for(const name of FATAL_ENV)if(environment[name])
  bad('real provider or deployment trust material present: '+name);
 for(const name of BLOCKED_SWITCHES){
  const value=environment[name];
  if(value&&value.toLowerCase()!=='false'&&value!=='0'&&value!=='disabled')
   bad('outbound/provider effect switch enabled: '+name);
 }
 if(inventory?.schema!=='medsol-r3n-postgresql-tenant-rls-inventory-v1'||
    inventory?.runId!==environment.GITHUB_RUN_ID||
    inventory?.releaseVerdict!=='NOT_CERTIFIED'||
    inventory?.status!=='DISPOSABLE_CI_INVENTORY_PASSED'||
    inventory?.uncoveredTenantTableCount!==0||
    inventory?.tenantTableCount!==47||
    inventory?.forceRlsTenantTableCount!==47)
  bad('same-run real database FORCE RLS census absent or failed');
 return{
  schema:'medsol-r3x-disposable-staging-preflight-v1',
  runId:environment.GITHUB_RUN_ID,
  verdict:'OFFLINE_DISPOSABLE_TEST_ALLOWED',
  releaseVerdict:'NOT_CERTIFIED',
  scope:'GITHUB_CI_ONLY_NO_PRODUCTION_AND_NO_REAL_PROVIDER_ACCOUNTS',
  database:{host:'localhost',name:'marketing_test',forceRlsTables:47,
   uncoveredTables:0,realProductionDatabaseInspected:false},
  externalProviderCredentialsPresent:false,
  actualExternalPublishAndEmailAllowed:false,
  realAiProviderAccountsConnected:false,
  independentOperatorSignedE2e:false,
  productionReady:false,
  evidenceDigest:digest(JSON.stringify({
   runId:environment.GITHUB_RUN_ID,
   source:'exact-local-database-rls-validated-nonprod-ci',
   count:inventory.tenantTableCount,uncovered:inventory.uncoveredTenantTableCount
  }))
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const idx=process.argv.indexOf('--output'),out=idx<0?null:process.argv[idx+1];
 if(!out||!out.endsWith('.json')||!existsSync('r3n-rls-inventory.json'))
  bad('output JSON path and same-run RLS census required');
 const census=JSON.parse(readFileSync('r3n-rls-inventory.json','utf8'));
 const manifest=assertDisposableStaging(process.env,census);
 writeFileSync(resolve(out),JSON.stringify(manifest,null,2)+'\n');
 process.stdout.write(JSON.stringify({
  schema:manifest.schema,runId:manifest.runId,
  verdict:manifest.verdict,releaseVerdict:manifest.releaseVerdict
 },null,2)+'\n');
}
