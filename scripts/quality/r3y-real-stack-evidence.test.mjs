import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertRealStackEvidence} from './r3y-real-stack-evidence.mjs';
const ids=['T04-012','T04-013','T04-014','T04-015','T04-016',
 'T03-024','T05-007','T06-023','T08-007','T09-011','T09-012',
 'T09-013','T10-010','T10-011','T11-005','T11-006',
 'T12-004','T13-015','T14-006'];
const source=ids.map(x=>"test('"+x+" named test',()=>{})").join('\n');
const report=()=>({
 suites:[{title:'r3y-real-stack.pw.ts',specs:ids.map(id=>({
  title:id+' named test',ok:true,tests:[{status:'expected',
   results:[{status:'passed',retry:0}]}]
 }))}],
 stats:{expected:19,unexpected:0,flaky:0,skipped:0}
});
const role={
 schema:'medsol-r3y-runtime-role-rls-proof-v1',runId:'12345',
 dbRole:'marketing_r3y_runtime',superuser:false,bypassRls:false,
 noTenantRowsVisible:0,tenantARowsVisible:3,tenantBRowsVisible:1,
 verdict:'DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED'
};
const staging={schema:'medsol-r3x-disposable-staging-preflight-v1',
 runId:'12345',productionReady:false,verdict:'OFFLINE_DISPOSABLE_TEST_ALLOWED',
 evidenceDigest:'sha256:dummy'};
const check=(r=report(),s=source,rl=role,st=staging)=>
 assertRealStackEvidence(r,s,rl,st,'12345',JSON.stringify(r));
test('R3Y accepts all real-stack executions while preserving zero independent signatures',()=>{
 const r=check();assert.equal(r.actualPassedRealStackCases,19);
 assert.equal(r.independentOperatorSignatures,0);
 assert.equal(r.realEntraProviderConnected,false);
 assert.equal(r.productionSecurityCertified,false);
});
test('R3Y rejects missing, skipped and duplicate browser evidence',()=>{
 const missing=report();missing.suites[0].specs.pop();
 assert.throws(()=>check(missing),/missing/);
 const skipped=report();skipped.suites[0].specs[0].tests[0].results[0].status='skipped';
 assert.throws(()=>check(skipped),/Skipped/);
 const duplicate=report();duplicate.suites[0].specs[0].title=duplicate.suites[0].specs[1].title;
 assert.throws(()=>check(duplicate),/Duplicated/);
});
test('R3Y refuses spoofed runtime roles or cross-tenant visibility',()=>{
 assert.throws(()=>check(report(),source,{...role,bypassRls:true}),/non-bypass/);
 assert.throws(()=>check(report(),source,{...role,tenantBRowsVisible:3}),/non-bypass/);
});
test('R3Y refuses unapproved staging or other run evidence',()=>{
 assert.throws(()=>check(report(),source,role,{...staging,productionReady:true}),/preflight/);
 assert.throws(()=>check(report(),source,{...role,runId:'other'}),/role/);
});
