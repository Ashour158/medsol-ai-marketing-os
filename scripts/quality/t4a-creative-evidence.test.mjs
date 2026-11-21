import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyT4ACreativeEvidence} from "./t4a-creative-evidence.mjs";
const run={id:"123456",sha:"a".repeat(40)};
const source=[1,2].map(i=>"test('T20-00"+i+" complete',async()=>{})").join("\n");
function report(){return{suites:[{title:"t4a-offline-creative-iteration.pw.ts",
 specs:[1,2].map(i=>({title:"T20-00"+i+" complete",ok:true,
  tests:[{status:"expected",results:[{status:"passed",retry:0}]}]}))}],
 stats:{expected:2,unexpected:0,flaky:0,skipped:0}};}
const role={schema:"medsol-r3y-runtime-role-rls-proof-v1",
 runId:run.id,dbRole:"marketing_r3y_runtime",bypassRls:false,superuser:false,
 tenantARowsVisible:3,tenantBRowsVisible:1,
 verdict:"DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED"};
const preflight={schema:"medsol-r3x-disposable-staging-preflight-v1",
 runId:run.id,verdict:"OFFLINE_DISPOSABLE_TEST_ALLOWED",releaseVerdict:"NOT_CERTIFIED",
 actualExternalPublishAndEmailAllowed:false,productionReady:false};
const staging={schema:"medsol-t1e-operator-staging-config-preflight-v1",
 mode:"DISPOSABLE_CI_ONLY",verdict:"CONFIG_VALIDATION_PASSED_NOT_DEPLOYED",
 externalProviderEffectsAllowed:false,releaseVerdict:"NOT_CERTIFIED"};
const go=(r=report(),s=source,rls=role,pre=preflight,oidc=staging)=>
 verifyT4ACreativeEvidence(r,s,run,rls,pre,oidc,JSON.stringify(r));
test("accepts actual two source-defined noncertifying browser outcomes",()=>{
 const result=go();assert.equal(result.actualPassingBrowserCases,2);
 assert.equal(result.independentlySigned500CaseQA,0);
 assert.equal(result.releaseVerdict,"NOT_CERTIFIED");
});
test("rejects fake missing, skipped, retried or overlapping browser cases",()=>{
 const missing=report();missing.suites[0].specs.pop();
 assert.throws(()=>go(missing),/Chromium acceptance/);
 const skipped=report();skipped.suites[0].specs[0].tests[0].results[0].status="skipped";
 assert.throws(()=>go(skipped),/Chromium acceptance/);
 const retried=report();retried.suites[0].specs[0].tests[0].results[0].retry=1;
 assert.throws(()=>go(retried),/Chromium acceptance/);
 const dup=report();dup.suites[0].specs.push(dup.suites[0].specs[0]);
 assert.throws(()=>go(dup),/Chromium acceptance/);
 assert.throws(()=>go(report(),source.replace("T20-002","T20-099")),/source-defined/);
});
test("rejects unsupported identity, fake isolation proof and external provider effects",()=>{
 assert.throws(()=>go(report(),source,{...role,runId:"wrong"}),/isolation/);
 assert.throws(()=>go(report(),source,{...role,bypassRls:true}),/isolation/);
 assert.throws(()=>go(report(),source,role,{
  ...preflight,actualExternalPublishAndEmailAllowed:true}),/preflight/);
 assert.throws(()=>go(report(),source,role,preflight,{
  ...staging,externalProviderEffectsAllowed:true}),/operator policy/);
});
