import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifySignedOperatorJourney} from './t1f-signed-operator-evidence.mjs';
const id='123456',commit='a'.repeat(40);
const source=Array.from({length:5},(_,i)=>
 "test('T17-"+String(i+1).padStart(3,'0')+" case', async()=>{});").join('\n');
const raw=x=>JSON.stringify(x);
function good(){
 return{
  suites:[{title:'t1f-signed-operator-journey.pw.ts',
   specs:Array.from({length:5},(_,i)=>({
    title:'T17-'+String(i+1).padStart(3,'0')+' case',ok:true,
    tests:[{status:'expected',results:[{status:'passed',retry:0,
     duration:i*150+10}]}]
   }))}],
  stats:{expected:5,unexpected:0,flaky:0,skipped:0}
 };
}
const proof={schema:'medsol-r3y-runtime-role-rls-proof-v1',runId:id,
 dbRole:'marketing_r3y_runtime',superuser:false,bypassRls:false,
 tenantARowsVisible:3,tenantBRowsVisible:1,
 verdict:'DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED'};
const pre={schema:'medsol-r3x-disposable-staging-preflight-v1',
 runId:id,verdict:'OFFLINE_DISPOSABLE_TEST_ALLOWED',
 releaseVerdict:'NOT_CERTIFIED',
 actualExternalPublishAndEmailAllowed:false,productionReady:false};
const staging={schema:'medsol-t1e-operator-staging-config-preflight-v1',
 mode:'DISPOSABLE_CI_ONLY',verdict:'CONFIG_VALIDATION_PASSED_NOT_DEPLOYED',
 releaseVerdict:'NOT_CERTIFIED',externalProviderEffectsAllowed:false,
 actualOperatorAuthenticated:false};
const verify=(report=good(),s=source,p=proof,preflight=pre,stage=staging,
 run={id,commit})=>verifySignedOperatorJourney(
 report,s,run,p,preflight,stage,raw(report));
test('T1F strict evidence for five real Chromium cases does not certify 500 independent UAT',()=>{
 const e=verify();
 assert.equal(e.actualPassingSignedOperatorJourneys,5);
 assert.equal(e.independentlySigned500CaseCount,0);
 assert.equal(e.realHumanOperatorsAuthenticated,0);
 assert.equal(e.actualDeployedStagingUat,false);
 assert.equal(e.observedCaseDurationsMs.length,5);
});
test('T1F evidence rejects skipped, retried, missing and duplicate browser cases',()=>{
 const skip=good();skip.suites[0].specs[0].tests[0].results[0].status='skipped';
 assert.throws(()=>verify(skip),/browser execution failed/);
 const retry=good();retry.suites[0].specs[0].tests[0].results[0].retry=1;
 assert.throws(()=>verify(retry),/browser execution failed/);
 const missing=good();missing.suites[0].specs.pop();
 assert.throws(()=>verify(missing),/browser execution failed/);
 const duplicate=good();duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
 assert.throws(()=>verify(duplicate),/browser execution failed/);
});
test('T1F requires exact source cases, duration, same-run RLS and no external provider access',()=>{
 assert.throws(()=>verify(good(),source.replace('T17-003','T17-009')),
  /immutable T1F/);
 const noDuration=good();delete noDuration.suites[0].specs[0].tests[0].results[0].duration;
 assert.throws(()=>verify(noDuration),/duration absent/);
 assert.throws(()=>verify(good(),source,{...proof,bypassRls:true}),/role\/RLS/);
 assert.throws(()=>verify(good(),source,{...proof,runId:'other'}),/role\/RLS/);
 assert.throws(()=>verify(good(),source,proof,{...pre,productionReady:true}),/no-provider/);
 assert.throws(()=>verify(good(),source,proof,pre,{...staging,actualOperatorAuthenticated:true}),
  /offline staging/);
 assert.throws(()=>verify(good(),source,proof,pre,staging,{id:'bad',commit}),
  /exact commit/);
});
