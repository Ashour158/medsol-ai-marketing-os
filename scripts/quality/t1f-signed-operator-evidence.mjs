#!/usr/bin/env node
/** Actual CI browser proof only, never independent staging UAT or release certification. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {indexedCases,verifyPlaywrightReport} from './r3w-browser-evidence.mjs';
const file='apps/web/e2e/t1f-signed-operator-journey.pw.ts';
const hash=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
const block=s=>{throw Error('T1F_SIGNED_OPERATOR_ACCEPTANCE_BLOCKED: '+s);};
export function verifySignedOperatorJourney(report,source,run,proof,preflight,staging,raw){
 if(!/^\d{5,18}$/.test(run?.id??'')||!/^[a-f0-9]{40}$/.test(run?.commit??''))
  block('real GitHub CI run and exact commit required');
 const required=indexedCases([{file,source}]);
 const ids=Array.from({length:5},(_,i)=>'T17-'+String(i+1).padStart(3,'0'));
 if(required.size!==5||ids.some(x=>!required.has(x)))
  block('exact five immutable T1F cases required');
 let passed;
 try{passed=verifyPlaywrightReport(report,required);}
 catch(e){block('browser execution failed: '+(e instanceof Error?e.message:'unknown'));}
 if(proof?.schema!=='medsol-r3y-runtime-role-rls-proof-v1'||
    proof.runId!==run.id||proof.dbRole!=='marketing_r3y_runtime'||
    proof.bypassRls!==false||proof.superuser!==false||
    proof.tenantARowsVisible!==3||proof.tenantBRowsVisible!==1||
    proof.verdict!=='DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED')
  block('same-run real restricted PostgreSQL role/RLS proof missing');
 if(preflight?.schema!=='medsol-r3x-disposable-staging-preflight-v1'||
    preflight.runId!==run.id||
    preflight.verdict!=='OFFLINE_DISPOSABLE_TEST_ALLOWED'||
    preflight.releaseVerdict!=='NOT_CERTIFIED'||
    preflight.actualExternalPublishAndEmailAllowed!==false||
    preflight.productionReady!==false)
  block('same-run real no-provider staging proof missing');
 if(staging?.schema!=='medsol-t1e-operator-staging-config-preflight-v1'||
    staging.mode!=='DISPOSABLE_CI_ONLY'||
    staging.verdict!=='CONFIG_VALIDATION_PASSED_NOT_DEPLOYED'||
    staging.releaseVerdict!=='NOT_CERTIFIED'||
    staging.externalProviderEffectsAllowed!==false||
    staging.actualOperatorAuthenticated!==false)
  block('T1E offline staging configuration proof missing');
 const durations=[];
 function scan(s){
  for(const spec of s.specs??[]){
   if(/^T17-\d{3} /.test(spec.title)){
    const ms=spec.tests?.[0]?.results?.[0]?.duration;
    if(!Number.isFinite(ms)||ms<0)block('real browser duration absent');
    durations.push({id:spec.title.slice(0,7),durationMs:ms});
   }
  }
  for(const nested of s.suites??[])scan(nested);
 }
 for(const suite of report.suites)scan(suite);
 if(durations.length!==5||new Set(durations.map(x=>x.id)).size!==5)
  block('incomplete test timing provenance');
 return{
  schema:'medsol-t1f-real-operator-journey-browser-evidence-v1',
  runId:run.id,commit:run.commit,releaseVerdict:'NOT_CERTIFIED',
  classification:'CI_DISPOSABLE_SIGNED_OIDC_CHROMIUM_REAL_NEXT_NEST_FORCE_RLS_POSTGRES',
  actualPassingSignedOperatorJourneys:5,caseIds:passed,
  runtimeRoleVerified:true,providerAccountsConnected:0,
  independentlySigned500CaseCount:0,realHumanOperatorsAuthenticated:0,
  realSocialPosts:0,realMessagesSent:0,inferenceProviderCalls:0,
  externalEffectsAuthorized:false,actualDeployedStagingUat:false,
  productionReady:false,
  executionTimingScope:'PLAYWRIGHT_TEST_WALL_TIME_ONLY_NOT_APP_LATENCY_OR_LOAD_BENCHMARK',
  observedCaseDurationsMs:durations.sort((a,b)=>a.id.localeCompare(b.id)),
  sourceDigest:hash(source),browserReportDigest:hash(raw),
  tenantRoleEvidenceDigest:hash(JSON.stringify(proof)),
  stagingPreflightDigest:hash(JSON.stringify(preflight))
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1]};
 const input=arg('--input'),output=arg('--output');
 if(!input?.endsWith('.json')||!output?.endsWith('.json')||
    process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
    process.env.MARKETING_T1F_EVIDENCE_CI_ONLY!=='1')
  block('GitHub CI and exact report/evidence paths required');
 const raw=readFileSync(input,'utf8');
 const manifest=verifySignedOperatorJourney(JSON.parse(raw),
  readFileSync(file,'utf8'),
  {id:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA},
  JSON.parse(readFileSync('r3y-runtime-role-evidence.json','utf8')),
  JSON.parse(readFileSync('r3x-staging-preflight.json','utf8')),
  JSON.parse(readFileSync('t1e-staging-config-evidence.json','utf8')),raw);
 writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');
 process.stdout.write(JSON.stringify({schema:manifest.schema,
  actualPassingSignedOperatorJourneys:manifest.actualPassingSignedOperatorJourneys,
  runId:manifest.runId,releaseVerdict:manifest.releaseVerdict,
  independentlySigned500CaseCount:0},null,2)+'\n');
}
