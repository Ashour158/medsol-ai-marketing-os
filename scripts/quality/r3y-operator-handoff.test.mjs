import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOperatorHandoff} from './r3y-operator-handoff.mjs';
const PLAN=[35,30,30,35,35,30,30,40,40,45,25,25,30,20,30,20];
const environment={runId:'123456',commit:'a'.repeat(40),indexRaw:'fake-canonical-index'};
function baseline(){
 const all=[];
 for(let suite=0;suite<PLAN.length;suite++){
  for(let i=1;i<=PLAN[suite];i++){
   const name='T'+String(suite+1).padStart(2,'0');
   const mapped=all.length<284;
   all.push({
    id:name+'-'+String(i).padStart(3,'0'),suite:name,area:'Area '+name,
    target500E2eCaseStatus:'UNEXECUTED',
    independentlySignedOff:false,externalEffectsAuthorized:false,
    engineeringEvidence:mapped?{
     status:'CI_ASSERTED',productionE2eCoverage:false,operatorSignoff:false,
     providerUatVerified:false,testSource:'real/test/path',
     contractEngine:'Verified CI engine'
    }:null
   });
  }
 }
 return {
  schema:'medsol-r3y-real-stack-500-case-acceptance-index-v1',
  runId:'123456',releaseVerdict:'NOT_CERTIFIED',
  plannedE2eCases:500,totalCases:500,
  mappedEngineeringAssertions:284,unmappedPlannedCases:216,
  referenceCasesAssertedInThisCi:284,
  executedAndIndependentlySignedE2eCases:0,
  realPublishOrEmailSendCount:0,providerAccountsTested:0,
  automaticallyWavable:false,
  realStackExecutionEvidence:{actualPassedRealStackCases:19,independentOperatorSignoff:false},
  browserExecutionEvidence:{passedCases:51},
  postgresExecutionEvidence:{actualPassedDatabaseCases:37},
  cases:all
 };
}
test('R3Y creates exactly 500 unsigned independent QA slots while preserving engineering baseline',()=>{
 const actual=buildOperatorHandoff(baseline(),environment);
 assert.equal(actual.caseRecords.length,500);
 assert.equal(actual.engineeringBaselineMapped,284);
 assert.equal(actual.stillUnmappedForEngineering,216);
 assert.equal(actual.independentlyExecutedStagingCases,0);
 assert.equal(actual.signatures.length,0);
 assert.equal(actual.missingMandatoryIndependentRoles.length,5);
 assert.equal(actual.caseRecords.every(x=>x.operatorId===null&&x.outcome==='NOT_EXECUTED'),true);
});
test('R3Y rejects fabricated independent operator acceptance and external side effects',()=>{
 const cert=baseline();cert.cases[2].target500E2eCaseStatus='PASS';
 assert.throws(()=>buildOperatorHandoff(cert,environment),/independent E2E/);
 const fake=baseline();fake.cases[40].engineeringEvidence.operatorSignoff=true;
 assert.throws(()=>buildOperatorHandoff(fake,environment),/independent E2E/);
 const publish=baseline();publish.realPublishOrEmailSendCount=1;
 assert.throws(()=>buildOperatorHandoff(publish,environment),/canonical/);
});
test('R3Y rejects duplicate or missing individual test slots',()=>{
 const duplicate=baseline();duplicate.cases[0].id=duplicate.cases[1].id;
 assert.throws(()=>buildOperatorHandoff(duplicate,environment),/duplicate/);
 const missing=baseline();missing.cases.pop();
 assert.throws(()=>buildOperatorHandoff(missing,environment),/500-case/);
});
test('R3Y rejects forged run and missing true real-stack engineering evidence',()=>{
 const other=baseline();other.runId='99999';
 assert.throws(()=>buildOperatorHandoff(other,environment),/same-run/);
 const incomplete=baseline();incomplete.realStackExecutionEvidence.actualPassedRealStackCases=18;
 assert.throws(()=>buildOperatorHandoff(incomplete,environment),/real-stack/);
 const invalid=baseline();
 assert.throws(()=>buildOperatorHandoff(invalid,{...environment,commit:'main'}),/commit/);
});
