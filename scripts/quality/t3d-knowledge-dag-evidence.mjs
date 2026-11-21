#!/usr/bin/env node
/** Actual CI proof for T3D evidence-gated signed DAGs; NOT production QA. */
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedCases,verifyPlaywrightReport} from "./r3w-browser-evidence.mjs";
const path="apps/web/e2e/t3d-signed-knowledge-dag.pw.ts";
const sha=s=>"sha256:"+createHash("sha256").update(s).digest("hex");
const fail=s=>{throw Error("T3D_KNOWLEDGE_EVIDENCE_BLOCKED: "+s);};
export function verifyT3DKnowledgeEvidence(report,source,run,role,preflight,staging,raw){
 if(!/^\d{5,18}$/.test(run?.id??"")||!/^[a-f0-9]{40}$/.test(run?.commit??""))
  fail("exact CI run and head required");
 const required=indexedCases([{file:path,source}]);
 if(required.size!==3||["T19-001","T19-002","T19-003"].some(x=>!required.has(x)))
  fail("exact source-defined T3D cases missing");
 let ids;
 try{ids=verifyPlaywrightReport(report,required);}
 catch(e){fail("real Chromium result invalid: "+String(e));}
 if(role?.schema!=="medsol-r3y-runtime-role-rls-proof-v1"||
    role.runId!==run.id||role.dbRole!=="marketing_r3y_runtime"||
    role.bypassRls!==false||role.superuser!==false||
    role.tenantARowsVisible!==3||role.tenantBRowsVisible!==1||
    role.verdict!=="DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED")
  fail("real same-run tenant RLS proof missing");
 if(preflight?.schema!=="medsol-r3x-disposable-staging-preflight-v1"||
    preflight.runId!==run.id||
    preflight.verdict!=="OFFLINE_DISPOSABLE_TEST_ALLOWED"||
    preflight.releaseVerdict!=="NOT_CERTIFIED"||
    preflight.actualExternalPublishAndEmailAllowed!==false||
    preflight.productionReady!==false)
  fail("no-egress staging proof missing");
 if(staging?.schema!=="medsol-t1e-operator-staging-config-preflight-v1"||
    staging.mode!=="DISPOSABLE_CI_ONLY"||
    staging.verdict!=="CONFIG_VALIDATION_PASSED_NOT_DEPLOYED"||
    staging.externalProviderEffectsAllowed!==false||
    staging.releaseVerdict!=="NOT_CERTIFIED")
  fail("signed disposable OIDC provenance missing");
 const elapsed=[];
 function scan(suite){
  for(const spec of suite.specs??[]){
   if(/^T19-\d{3} /.test(spec.title)){
    const duration=spec.tests?.[0]?.results?.[0]?.duration;
    if(!Number.isFinite(duration)||duration<0)fail("missing actual case duration");
    elapsed.push({id:spec.title.slice(0,7),durationMs:duration});
   }
  }
  for(const child of suite.suites??[])scan(child);
 }
 for(const suite of report.suites)scan(suite);
 if(elapsed.length!==3||new Set(elapsed.map(x=>x.id)).size!==3)
  fail("incomplete case timing");
 return{schema:"medsol-t3d-knowledge-dag-browser-evidence-v1",
  runId:run.id,commit:run.commit,classification:"DISPOSABLE_SIGNED_OIDC_NEXT_NEST_POSTGRES",
  actualPassingBrowserCases:3,caseIds:ids,
  caseWallDurationsMs:elapsed.sort((a,b)=>a.id.localeCompare(b.id)),
  sourceDigest:sha(source),reportDigest:sha(raw),
  roleProofDigest:sha(JSON.stringify(role)),
  stagingPreflightDigest:sha(JSON.stringify(preflight)),
  externalEffectsAuthorized:false,actualModelCalls:0,
  realProviderAccounts:0,realMessagesSent:0,realPosts:0,
  independentlySigned500CaseQa:0,persistentStagingDeployed:false,
  productionReady:false,releaseVerdict:"NOT_CERTIFIED"};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1]};
 const input=arg("--input"),output=arg("--output");
 if(!input?.endsWith(".json")||!output?.endsWith(".json")||
    process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
    process.env.MARKETING_T3D_EVIDENCE_CI_ONLY!=="1")
  fail("only real GitHub runner may issue bounded execution evidence");
 const raw=readFileSync(input,"utf8");
 const e=verifyT3DKnowledgeEvidence(JSON.parse(raw),readFileSync(path,"utf8"),
  {id:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA},
  JSON.parse(readFileSync("r3y-runtime-role-evidence.json","utf8")),
  JSON.parse(readFileSync("r3x-staging-preflight.json","utf8")),
  JSON.parse(readFileSync("t1e-staging-config-evidence.json","utf8")),raw);
 writeFileSync(output,JSON.stringify(e,null,2)+"\n");
 process.stdout.write(JSON.stringify({schema:e.schema,
  actualPassingBrowserCases:e.actualPassingBrowserCases,
  releaseVerdict:e.releaseVerdict,runId:e.runId})+"\n");
}
