#!/usr/bin/env node
/**
 * R3-W: CI runtime evidence for actual Chromium test executions.
 * This is NOT independent QA, production security, or provider acceptance.
 * It checks Playwright's machine report against exact executable case IDs,
 * rejects skipped/retried/failed/double-counted cases, and records digests.
 */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCES=[
 'apps/web/e2e/marketing-journey.pw.ts',
 'apps/web/e2e/r3w-chaos-recovery.pw.ts'
];
const hex=text=>createHash('sha256').update(text).digest('hex');
export function indexedCases(files){
 const ids=new Set();
 for(const {file,source} of files){
  const matches=[...source.matchAll(/\btest\(['"](T\d{2}-\d{3}) /g)];
  if(!matches.length)throw new Error('Missing explicit browser cases in '+file);
  for(const match of matches){
   if(ids.has(match[1]))throw new Error('Duplicate Chromium case ID '+match[1]);
   ids.add(match[1]);
  }
 }
 return ids;
}
export function verifyPlaywrightReport(report,required){
 if(!report||!Array.isArray(report.suites)||!report.suites.length)
  throw new Error('Missing full Playwright JSON test suites');
 const actual=new Set();
 let visited=0;
 function descend(suite){
  for(const spec of suite.specs??[]){
   visited++;
   const match=/^(T\d{2}-\d{3}) /.exec(spec.title??'');
   if(!match||!required.has(match[1]))
    throw new Error('Unregistered browser spec: '+spec.title);
   if(actual.has(match[1]))throw new Error('Duplicated executed browser case '+match[1]);
   actual.add(match[1]);
   if(spec.ok!==true||!Array.isArray(spec.tests)||spec.tests.length!==1)
    throw new Error('Nonpassing browser case: '+match[1]);
   const test=spec.tests[0];
   if(test.status!=='expected'||!Array.isArray(test.results)||test.results.length!==1||
      test.results[0].status!=='passed'||test.results[0].retry!==0)
    throw new Error('Skipped, retried, failing or unexecuted browser case '+match[1]);
  }
  for(const nested of suite.suites??[])descend(nested);
 }
 for(const suite of report.suites)descend(suite);
 if(actual.size!==required.size||visited!==required.size)
  throw new Error('Browser report missing a required executed case: '+actual.size+'/'+required.size);
 for(const id of required)if(!actual.has(id))
  throw new Error('Browser execution evidence absent for '+id);
 const stats=report.stats;
 if(!stats||stats.expected!==required.size||stats.unexpected!==0||
    stats.flaky!==0||stats.skipped!==0)
  throw new Error('Playwright test totals, flaky, failures or skips differ from executed case set');
 return [...actual].sort();
}
export function generateEvidence(report,files,rawReport,ci){
 const required=indexedCases(files);
 const cases=verifyPlaywrightReport(report,required);
 return{
  schema:'medsol-r3w-chromium-execution-evidence-v1',
  runId:ci.runId,
  evidenceClassification:'CI_CHROMIUM_UI_SYNTHETIC_BACKEND_NOT_INDEPENDENT_E2E',
  releaseVerdict:'NOT_CERTIFIED',
  actualExecutedBrowserCases:cases.length,
  browserPassedCases:cases.length,
  caseIds:cases,
  reportSha256:'sha256:'+hex(rawReport),
  sourceDigests:files.map(x=>({file:x.file,sha256:'sha256:'+hex(x.source)})),
  playwrightStats:report.stats,
  independentlySignedE2eCases:0,
  realProviderCalls:0,
  realEmailSends:0,
  realSocialPosts:0,
  operatorSignedOff:false,
  productionCertified:false
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=(key)=>{const i=process.argv.indexOf(key);return i<0?null:process.argv[i+1]};
 const input=arg('--input'),output=arg('--output');
 if(!input||!output||!input.endsWith('.json')||!output.endsWith('.json'))
  throw new Error('Provide JSON input and JSON output paths');
 const reportText=readFileSync(input,'utf8');
 const files=SOURCES.map(file=>{
  if(!existsSync(file))throw new Error('Missing browser source '+file);
  return{file,source:readFileSync(file,'utf8')};
 });
 const inCi=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
  /^\d{5,18}$/.test(process.env.GITHUB_RUN_ID??'');
 const evidence=generateEvidence(JSON.parse(reportText),files,reportText,{
  runId:inCi?process.env.GITHUB_RUN_ID:null
 });
 if(!inCi)throw new Error('Same-run CI browser evidence cannot be minted locally');
 if(evidence.actualExecutedBrowserCases!==51)
  throw new Error('Expected precisely 51 actually passed Chromium browser cases');
 writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
 process.stdout.write(JSON.stringify({
  schema:evidence.schema,runId:evidence.runId,
  actualExecutedBrowserCases:evidence.actualExecutedBrowserCases,
  releaseVerdict:evidence.releaseVerdict,
  independentlySignedE2eCases:evidence.independentlySignedE2eCases
 },null,2)+'\n');
}
