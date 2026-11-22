#!/usr/bin/env node
/** Bound actual signed-offline-DAG Chromium execution to same-run RLS and
 * offline provider evidence. No claim of independent 500-case QA or deployment.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedCases,verifyPlaywrightReport} from "./r3w-browser-evidence.mjs";
const file="apps/web/e2e/t3c-offline-dag-operator.pw.ts";
const hash=s=>"sha256:"+createHash("sha256").update(s).digest("hex");
const deny=s=>{throw Error("T3C_SIGNED_DAG_EVIDENCE_BLOCKED: "+s);};
export function verifyT3CDagEvidence(report,source,run,role,preflight,staging,raw){
 if(!/^\d{5,18}$/.test(run?.id??"")||!/^[a-f0-9]{40}$/.test(run?.commit??""))
  deny("exact GitHub run and commit required");
 const registered=indexedCases([{file,source}]);
 const expected=["T18-001","T18-002","T18-003","T18-004"];
 if(registered.size!==4||expected.some(id=>!registered.has(id)))
  deny("four immutable signed DAG operator cases required");
 let ids;
 try{ids=verifyPlaywrightReport(report,registered);}
 catch(e){deny("actual Chromium results invalid: "+String(e));}
 if(role?.schema!=="medsol-r3y-runtime-role-rls-proof-v1"||
    role.runId!==run.id||role.dbRole!=="marketing_r3y_runtime"||
    role.bypassRls!==false||role.superuser!==false||
    role.tenantARowsVisible!==3||role.tenantBRowsVisible!==1||
    role.verdict!=="DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED")
  deny("same-run real PostgreSQL RLS proof absent");
 if(preflight?.schema!=="medsol-r3x-disposable-staging-preflight-v1"||
    preflight.runId!==run.id||
    preflight.verdict!=="OFFLINE_DISPOSABLE_TEST_ALLOWED"||
    preflight.releaseVerdict!=="NOT_CERTIFIED"||
    preflight.actualExternalPublishAndEmailAllowed!==false||
    preflight.productionReady!==false)
  deny("same-run no-egress proof absent");
 if(staging?.schema!=="medsol-t1e-operator-staging-config-preflight-v1"||
    staging.mode!=="DISPOSABLE_CI_ONLY"||
    staging.verdict!=="CONFIG_VALIDATION_PASSED_NOT_DEPLOYED"||
    staging.externalProviderEffectsAllowed!==false||
    staging.releaseVerdict!=="NOT_CERTIFIED")
  deny("local-only signed OIDC proof absent");
 const durations=[];
 function visit(suite){
  for(const spec of suite.specs??[]){
   if(/^T18-\d{3} /.test(spec.title)){
    const ms=spec.tests?.[0]?.results?.[0]?.duration;
    if(!Number.isFinite(ms)||ms<0)deny("real Chromium duration missing");
    durations.push({caseId:spec.title.slice(0,7),durationMs:ms});
   }
  }
  for(const child of suite.suites??[])visit(child);
 }
 for(const suite of report.suites)visit(suite);
 if(durations.length!==4||new Set(durations.map(x=>x.caseId)).size!==4)
  deny("real Chromium timings incomplete");
 return{
  schema:"medsol-t3c-signed-dag-operator-evidence-v1",
  runId:run.id,commit:run.commit,releaseVerdict:"NOT_CERTIFIED",
  classification:"CI_DISPOSABLE_SIGNED_ED25519_OIDC_CHROMIUM_NEXT_NEST_POSTGRES",
  actualPassingBrowserCases:4,caseIds:ids,
  observedTestWallDurationsMs:durations.sort((a,b)=>a.caseId.localeCompare(b.caseId)),
  sourceDigest:hash(source),reportDigest:hash(raw),
  roleProofDigest:hash(JSON.stringify(role)),preflightDigest:hash(JSON.stringify(preflight)),
  realProviderAccountsConnected:0,realSocialPosts:0,realMessagesSent:0,
  actualModelCalls:0,externalEffectsAuthorized:false,
  independent500CaseHumanQa:0,externalStagingDeployed:false,
  productionReady:false
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1]};
 const input=arg("--input"),output=arg("--output");
 if(!input?.endsWith(".json")||!output?.endsWith(".json")||
    process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
    process.env.MARKETING_T3C_EVIDENCE_CI_ONLY!=="1")
  deny("must run in actual GitHub CI with explicit report paths");
 const raw=readFileSync(input,"utf8");
 const proof=verifyT3CDagEvidence(JSON.parse(raw),
  readFileSync(file,"utf8"),{id:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA},
  JSON.parse(readFileSync("r3y-runtime-role-evidence.json","utf8")),
  JSON.parse(readFileSync("r3x-staging-preflight.json","utf8")),
  JSON.parse(readFileSync("t1e-staging-config-evidence.json","utf8")),raw);
 writeFileSync(output,JSON.stringify(proof,null,2)+"\n");
 process.stdout.write(JSON.stringify({schema:proof.schema,
  actualPassingBrowserCases:proof.actualPassingBrowserCases,
  releaseVerdict:"NOT_CERTIFIED",runId:proof.runId})+"\n");
}
