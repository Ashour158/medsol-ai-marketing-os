#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {indexedCases,verifyPlaywrightReport} from './r3w-browser-evidence.mjs';
const file='apps/web/e2e/r3y-real-stack.pw.ts';
const hex=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
export function assertRealStackEvidence(report,source,role,staging,runId,rawText){
 const cases=indexedCases([{file,source}]);
 if(cases.size!==19)throw Error('Expected exactly 19 real-stack Chromium cases');
 const passed=verifyPlaywrightReport(report,cases);
 if(!role||role.schema!=='medsol-r3y-runtime-role-rls-proof-v1'||
    role.runId!==runId||role.dbRole!=='marketing_r3y_runtime'||
    role.superuser!==false||role.bypassRls!==false||
    role.noTenantRowsVisible!==0||role.tenantARowsVisible!==3||
    role.tenantBRowsVisible!==1||
    role.verdict!=='DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED')
  throw Error('Same-run non-bypass RLS runtime role evidence absent');
 if(!staging||staging.schema!=='medsol-r3x-disposable-staging-preflight-v1'||
    staging.runId!==runId||staging.productionReady!==false||
    staging.verdict!=='OFFLINE_DISPOSABLE_TEST_ALLOWED')
  throw Error('Same-run no-provider staging preflight absent');
 return{
  schema:'medsol-r3y-real-stack-actual-browser-evidence-v1',
  runId,releaseVerdict:'NOT_CERTIFIED',
  classification:'CI_CHROMIUM_REAL_NEXT_REAL_NEST_REAL_POSTGRES_LOCAL_SIGNED_JWKS_NO_INDEPENDENT_QA',
  frontend:'production_build_https_loopback',
  api:'compiled_real_nest_server',
  database:'real_migrated_postgres_non_bypassrls_app_role',
  identity:'disposable_rs256_test_signed_oidc_claims_not_real_entra',
  stagingSourceDigest:staging.evidenceDigest,
  runtimeRoleVerified:true,
  actualPassedRealStackCases:passed.length,caseIds:passed,
  sourceSha256:hex(source),reportSha256:hex(rawText),
  independentOperatorSignatures:0,realEntraProviderConnected:false,
  actualProviderCredentials:0,realMessagesSent:0,realSocialPosts:0,
  productionSecurityCertified:false
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=flag=>{const i=process.argv.indexOf(flag);return i<0?null:process.argv[i+1]};
 const input=arg('--input'),output=arg('--output');
 const runId=process.env.GITHUB_RUN_ID;
 if(!input?.endsWith('.json')||!output?.endsWith('.json')||
   process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
   !/^\d{5,18}$/.test(runId??''))
  throw Error('R3Y real-stack evidence requires same-run CI and explicit JSON paths');
 const raw=readFileSync(input,'utf8');
 const report=JSON.parse(raw);
 const role=JSON.parse(readFileSync('r3y-runtime-role-evidence.json','utf8'));
 const staging=JSON.parse(readFileSync('r3x-staging-preflight.json','utf8'));
 const manifest=assertRealStackEvidence(report,readFileSync(file,'utf8'),role,staging,runId,raw);
 writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');
 process.stdout.write(JSON.stringify({
  schema:manifest.schema,runId:manifest.runId,
  actualPassedRealStackCases:manifest.actualPassedRealStackCases,
  productionSecurityCertified:false
 },null,2)+'\n');
}
