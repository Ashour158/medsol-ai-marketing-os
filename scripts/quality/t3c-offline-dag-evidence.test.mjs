import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyT3CDagEvidence} from "./t3c-offline-dag-evidence.mjs";
const run={id:"123456",commit:"b".repeat(40)};
const source=Array.from({length:4},(_,i)=>"test('T18-00"+(i+1)+" case',async()=>{});").join("\n");
const valid=()=>({suites:[{title:"t3c-offline-dag-operator.pw.ts",
 specs:Array.from({length:4},(_,i)=>({title:"T18-00"+(i+1)+" case",ok:true,
  tests:[{status:"expected",results:[{status:"passed",retry:0,duration:i+20}]}]}))}],
 stats:{expected:4,unexpected:0,flaky:0,skipped:0}});
const role={schema:"medsol-r3y-runtime-role-rls-proof-v1",
 runId:run.id,dbRole:"marketing_r3y_runtime",superuser:false,bypassRls:false,
 tenantARowsVisible:3,tenantBRowsVisible:1,
 verdict:"DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED"};
const preflight={schema:"medsol-r3x-disposable-staging-preflight-v1",
 runId:run.id,verdict:"OFFLINE_DISPOSABLE_TEST_ALLOWED",
 releaseVerdict:"NOT_CERTIFIED",actualExternalPublishAndEmailAllowed:false,
 productionReady:false};
const staging={schema:"medsol-t1e-operator-staging-config-preflight-v1",
 mode:"DISPOSABLE_CI_ONLY",verdict:"CONFIG_VALIDATION_PASSED_NOT_DEPLOYED",
 externalProviderEffectsAllowed:false,releaseVerdict:"NOT_CERTIFIED"};
const verify=(report=valid(),s=source,r=role,pre=preflight,stage=staging)=>
 verifyT3CDagEvidence(report,s,run,r,pre,stage,JSON.stringify(report));
test("T3C evidence only claims four real CI cases and zero independent QA",()=>{
 const a=verify();
 assert.equal(a.actualPassingBrowserCases,4);
 assert.deepEqual(a.caseIds,["T18-001","T18-002","T18-003","T18-004"]);
 assert.equal(a.independent500CaseHumanQa,0);
 assert.equal(a.externalStagingDeployed,false);
});
test("T3C evidence rejects forged, missing, flaky, skipped or retried cases",()=>{
 const missing=valid();missing.suites[0].specs.pop();
 assert.throws(()=>verify(missing),/invalid/);
 const skipped=valid();skipped.suites[0].specs[0].tests[0].results[0].status="skipped";
 assert.throws(()=>verify(skipped),/invalid/);
 const retry=valid();retry.suites[0].specs[0].tests[0].results[0].retry=1;
 assert.throws(()=>verify(retry),/invalid/);
 const duplicate=valid();duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
 assert.throws(()=>verify(duplicate),/invalid/);
});
test("T3C evidence requires same-run FORCE-RLS and no-provider preflight",()=>{
 assert.throws(()=>verify(valid(),source.replace("T18-002","T18-009")),/immutable/);
 assert.throws(()=>verify(valid(),source,{...role,bypassRls:true}),/RLS/);
 assert.throws(()=>verify(valid(),source,{...role,runId:"wrong"}),/RLS/);
 assert.throws(()=>verify(valid(),source,role,{...preflight,productionReady:true}),/no-egress/);
 assert.throws(()=>verify(valid(),source,role,preflight,{...staging,externalProviderEffectsAllowed:true}),/signed OIDC/);
 const noTime=valid();delete noTime.suites[0].specs[0].tests[0].results[0].duration;
 assert.throws(()=>verify(noTime),/duration missing/);
});
