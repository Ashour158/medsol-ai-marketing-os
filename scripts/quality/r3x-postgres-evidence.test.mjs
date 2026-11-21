import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractSourceCases,assertPostgresVitestReport,evidenceFor} from './r3x-postgres-evidence.mjs';
const ids=Array.from({length:37},(_,i)=>'T13-'+String(i+1).padStart(3,'0'));
const src=ids.map(id=>"it('"+id+" check',()=>{})").join('\n');
const report=()=>({
 success:true,numPassedTests:37,numFailedTests:0,numPendingTests:0,numTotalTests:37,
 testResults:[{name:'/tmp/postgres-r3x-cross-engine-staging.integration.test.ts',
  assertionResults:ids.map(id=>({title:id+' check',status:'passed',failureMessages:[]}))}]
});
const staging={schema:'medsol-r3x-disposable-staging-preflight-v1',
 runId:'12345',verdict:'OFFLINE_DISPOSABLE_TEST_ALLOWED',productionReady:false,evidenceDigest:'sha256:fake'};
test('R3X actual PostgreSQL report accepts 37 exact passed cases without independent signoff',()=>{
 const result=evidenceFor(report(),src,JSON.stringify(report()),'12345',staging);
 assert.equal(result.actualPassedDatabaseCases,37);
 assert.equal(result.independentOperatorSignoffs,0);
 assert.equal(result.releaseVerdict,'NOT_CERTIFIED');
});
test('R3X source inventory refuses duplicate and missing IDs',()=>{
 assert.throws(()=>extractSourceCases(src+'\n'+src.slice(0,30)),/exactly 37 unique/);
 assert.throws(()=>extractSourceCases(src.slice(0,-33)),/37 unique/);
});
test('R3X runtime refuses skipped and fabricated passing count',()=>{
 const skipped=report();skipped.testResults[0].assertionResults[0].status='pending';
 assert.throws(()=>assertPostgresVitestReport(skipped,ids),/Skipped or failed/);
 const fake=report();fake.numPassedTests=36;
 assert.throws(()=>assertPostgresVitestReport(fake,ids),/count mismatched/);
});
test('R3X runtime refuses duplicate case and different suite',()=>{
 const duplicated=report();duplicated.testResults[0].assertionResults[0].title=duplicated.testResults[0].assertionResults[1].title;
 assert.throws(()=>assertPostgresVitestReport(duplicated,ids),/duplicate/);
 const wrong=report();wrong.testResults[0].name='other.test.ts';
 assert.throws(()=>assertPostgresVitestReport(wrong,ids),/exact real PostgreSQL source/);
});
test('R3X refuses mismatched or production-claimed preflight',()=>{
 assert.throws(()=>evidenceFor(report(),src,'{}','99999',staging),/preflight/);
 assert.throws(()=>evidenceFor(report(),src,'{}','12345',{...staging,productionReady:true}),/preflight/);
});
