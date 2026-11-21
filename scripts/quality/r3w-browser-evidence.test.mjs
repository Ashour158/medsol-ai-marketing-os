import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexedCases,verifyPlaywrightReport,generateEvidence} from './r3w-browser-evidence.mjs';
const fs=[{file:'r3w-test.pw.ts',source:"test('T01-023 first case',async()=>{});"}];
const good=()=>({
 suites:[{title:'r3w-test.pw.ts',specs:[{
  title:'T01-023 first case',ok:true,tests:[{
   status:'expected',results:[{status:'passed',retry:0,duration:100}]
  }]
 }]}],
 stats:{expected:1,unexpected:0,flaky:0,skipped:0}
});
test('R3W reference pass records real executed test and non-signing limitation',()=>{
 const e=generateEvidence(good(),fs,JSON.stringify(good()),{runId:'12345'});
 assert.equal(e.actualExecutedBrowserCases,1);
 assert.equal(e.independentlySignedE2eCases,0);
 assert.equal(e.releaseVerdict,'NOT_CERTIFIED');
 assert.equal(e.operatorSignedOff,false);
});
test('R3W refuses missing or duplicate declared case IDs',()=>{
 assert.throws(()=>indexedCases([...fs,...fs]),/Duplicate Chromium/);
 assert.throws(()=>indexedCases([{file:'empty',source:'it("unmapped",()=>{})'}]),/Missing explicit/);
});
test('R3W refuses skipped actual execution even when the spec is marked okay',()=>{
 const d=good();d.suites[0].specs[0].tests[0].results[0].status='skipped';
 assert.throws(()=>verifyPlaywrightReport(d,indexedCases(fs)),/Skipped/);
});
test('R3W refuses failed and flaky execution',()=>{
 const d=good();d.suites[0].specs[0].ok=false;
 assert.throws(()=>verifyPlaywrightReport(d,indexedCases(fs)),/Nonpassing/);
 const e=good();e.stats.flaky=1;
 assert.throws(()=>verifyPlaywrightReport(e,indexedCases(fs)),/flaky/);
});
test('R3W refuses missing runtime cases, invalid titles and forged test totals',()=>{
 const missing=good();missing.suites=[{title:'r3w-test.pw.ts',specs:[]}];
 assert.throws(()=>verifyPlaywrightReport(missing,indexedCases(fs)),/missing/);
 const wrong=good();wrong.suites[0].specs[0].title='T02-001 unexpected';
 assert.throws(()=>verifyPlaywrightReport(wrong,indexedCases(fs)),/Unregistered/);
 const total=good();total.stats.expected=7;
 assert.throws(()=>verifyPlaywrightReport(total,indexedCases(fs)),/totals/);
});
test('R3W refuses silent retries and duplicate runtime specs',()=>{
 const retry=good();retry.suites[0].specs[0].tests[0].results.push({status:'passed',retry:1});
 assert.throws(()=>verifyPlaywrightReport(retry,indexedCases(fs)),/retried/);
 const dup=good();dup.suites[0].specs.push(structuredClone(dup.suites[0].specs[0]));
 assert.throws(()=>verifyPlaywrightReport(dup,indexedCases(fs)),/Duplicated/);
});
