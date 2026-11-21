import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyT3DKnowledgeEvidence} from "./t3d-knowledge-dag-evidence.mjs";
const run={id:"123456",commit:"c".repeat(40)};
const source=[1,2,3].map(i=>"test('T19-00"+i+" synthetic',async()=>{})").join("\n");
const good=()=>({suites:[{title:"t3d-signed-knowledge-dag.pw.ts",
 specs:[1,2,3].map(i=>({title:"T19-00"+i+" synthetic",ok:true,
  tests:[{status:"expected",results:[{status:"passed",retry:0,duration:100+i}]}]}))}],
 stats:{expected:3,unexpected:0,flaky:0,skipped:0}});
const role={schema:"medsol-r3y-runtime-role-rls-proof-v1",
 runId:run.id,dbRole:"marketing_r3y_runtime",superuser:false,bypassRls:false,
 tenantARowsVisible:3,tenantBRowsVisible:1,
 verdict:"DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED"};
const pre={schema:"medsol-r3x-disposable-staging-preflight-v1",
 runId:run.id,verdict:"OFFLINE_DISPOSABLE_TEST_ALLOWED",releaseVerdict:"NOT_CERTIFIED",
 actualExternalPublishAndEmailAllowed:false,productionReady:false};
const staging={schema:"medsol-t1e-operator-staging-config-preflight-v1",
 mode:"DISPOSABLE_CI_ONLY",verdict:"CONFIG_VALIDATION_PASSED_NOT_DEPLOYED",
 externalProviderEffectsAllowed:false,releaseVerdict:"NOT_CERTIFIED"};
const check=(report=good(),s=source,r=role,p=pre,st=staging)=>
 verifyT3DKnowledgeEvidence(report,s,run,r,p,st,JSON.stringify(report));
test("T3D only certifies genuine disposable engineering cases",()=>{
 const x=check();assert.equal(x.actualPassingBrowserCases,3);
 assert.equal(x.independentlySigned500CaseQa,0);
 assert.equal(x.productionReady,false);
});
test("T3D denies forged, skipped, duplicated and missing Chromium cases",()=>{
 const missing=good();missing.suites[0].specs.pop();
 assert.throws(()=>check(missing),/invalid/);
 const skip=good();skip.suites[0].specs[0].tests[0].results[0].status="skipped";
 assert.throws(()=>check(skip),/invalid/);
 const retry=good();retry.suites[0].specs[0].tests[0].results[0].retry=1;
 assert.throws(()=>check(retry),/invalid/);
 const duplicate=good();duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
 assert.throws(()=>check(duplicate),/invalid/);
 assert.throws(()=>check(good(),source.replace("T19-001","T19-999")),/source-defined/);
});
test("T3D binds proof to same-run RLS, nonprovider preflight, timings and OIDC",()=>{
 assert.throws(()=>check(good(),source,{...role,bypassRls:true}),/tenant RLS/);
 assert.throws(()=>check(good(),source,{...role,runId:"wrong"}),/tenant RLS/);
 assert.throws(()=>check(good(),source,role,{...pre,productionReady:true}),/no-egress/);
 assert.throws(()=>check(good(),source,role,pre,{
  ...staging,externalProviderEffectsAllowed:true}),/OIDC/);
 const duration=good();delete duration.suites[0].specs[1].tests[0].results[0].duration;
 assert.throws(()=>check(duration),/duration/);
});
