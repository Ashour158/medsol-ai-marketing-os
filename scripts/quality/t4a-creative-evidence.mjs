#!/usr/bin/env node
/** Actual compiled Next/Nest/Postgres signed OIDC browser proof. NOT QA certification. */
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {indexedCases,verifyPlaywrightReport} from "./r3w-browser-evidence.mjs";
const sourcePath="apps/web/e2e/t4a-offline-creative-iteration.pw.ts";
const sha=s=>"sha256:"+createHash("sha256").update(s).digest("hex");
const reject=reason=>{throw Error("T4A_CREATIVE_EVIDENCE_REJECTED: "+reason);};
export function verifyT4ACreativeEvidence(report,source,run,role,preflight,staging,raw){
 if(!/^\d{5,18}$/.test(run?.id??"")||!/^[a-f0-9]{40}$/.test(run?.sha??""))
  reject("same-run CI and immutable commit required");
 const names=indexedCases([{file:sourcePath,source}]);
 if(names.size!==2||!names.has("T20-001")||!names.has("T20-002"))
  reject("required source-defined browser cases absent");
 let ids;
 try{ids=verifyPlaywrightReport(report,names);}
 catch(error){reject("actual Chromium acceptance not proven: "+String(error));}
 if(role?.schema!=="medsol-r3y-runtime-role-rls-proof-v1"||
    role.runId!==run.id||role.dbRole!=="marketing_r3y_runtime"||
    role.bypassRls!==false||role.superuser!==false||
    role.tenantARowsVisible!==3||role.tenantBRowsVisible!==1||
    role.verdict!=="DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED")
  reject("same-run PostgreSQL restricted-role isolation proof missing");
 if(preflight?.schema!=="medsol-r3x-disposable-staging-preflight-v1"||
    preflight.runId!==run.id||
    preflight.verdict!=="OFFLINE_DISPOSABLE_TEST_ALLOWED"||
    preflight.releaseVerdict!=="NOT_CERTIFIED"||
    preflight.actualExternalPublishAndEmailAllowed!==false||
    preflight.productionReady!==false)
  reject("zero-provider offline staging preflight missing");
 if(staging?.schema!=="medsol-t1e-operator-staging-config-preflight-v1"||
    staging.mode!=="DISPOSABLE_CI_ONLY"||
    staging.verdict!=="CONFIG_VALIDATION_PASSED_NOT_DEPLOYED"||
    staging.externalProviderEffectsAllowed!==false||
    staging.releaseVerdict!=="NOT_CERTIFIED")
  reject("disposable signed operator policy proof missing");
 return{schema:"medsol-t4a-signed-offline-creative-browser-evidence-v1",
  runId:run.id,commit:run.sha,actualPassingBrowserCases:2,
  cases:ids,sourceDigest:sha(source),reportDigest:sha(raw),
  rlsProofDigest:sha(JSON.stringify(role)),
  preflightDigest:sha(JSON.stringify(preflight)),
  stagingIdentityDigest:sha(JSON.stringify(staging)),
  classification:"DISPOSABLE_REAL_NEXT_NEST_POSTGRES_SIGNED_OIDC",
  immutableCreativeRevisionsTested:true,
  independentRightsVerificationClaimed:false,
  realCreativeAIProviderCalls:0,realSocialPosts:0,realEmailSent:0,
  independentlySigned500CaseQA:0,productionCertified:false,
  releaseVerdict:"NOT_CERTIFIED"};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1]};
 const inp=arg("--input"),out=arg("--output");
 if(!inp?.endsWith(".json")||!out?.endsWith(".json")||
    process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
    process.env.MARKETING_T4A_EVIDENCE_CI_ONLY!=="1")
  reject("only real disposable GitHub Actions may issue T4A evidence");
 const raw=readFileSync(inp,"utf8");
 const result=verifyT4ACreativeEvidence(JSON.parse(raw),
  readFileSync(sourcePath,"utf8"),{
   id:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA
  },JSON.parse(readFileSync("r3y-runtime-role-evidence.json","utf8")),
  JSON.parse(readFileSync("r3x-staging-preflight.json","utf8")),
  JSON.parse(readFileSync("t1e-staging-config-evidence.json","utf8")),raw);
 writeFileSync(out,JSON.stringify(result,null,2)+"\n");
 process.stdout.write(JSON.stringify({schema:result.schema,
  passing:result.actualPassingBrowserCases,
  releaseVerdict:result.releaseVerdict,runId:result.runId})+"\n");
}
