#!/usr/bin/env node
/**
 * R3-X verify Vitest's actual JSON reporter for this real PostgreSQL test file.
 * Rejects skipped/failing/duplicate/unexecuted cases; does not sign E2E.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SOURCE='apps/api/src/postgres-r3x-cross-engine-staging.integration.test.ts';
const hash=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
export function extractSourceCases(source){
 const cases=[...source.matchAll(/\bit\(['"](T\d{2}-\d{3}) /g)].map(m=>m[1]);
 if(cases.length!==37||new Set(cases).size!==37)
  throw new Error('Expected exactly 37 unique literal R3-X PostgreSQL integration cases');
 return cases.sort();
}
export function assertPostgresVitestReport(report,expected){
 if(!report||!Array.isArray(report.testResults)||report.testResults.length!==1||
    !Array.isArray(report.testResults[0].assertionResults))
  throw new Error('R3-X actual isolated Vitest PostgreSQL JSON suite missing');
 const suite=report.testResults[0];
 if(!suite.name?.includes('postgres-r3x-cross-engine-staging.integration.test.ts'))
  throw new Error('R3-X reporter is not bound to exact real PostgreSQL source');
 const rows=suite.assertionResults;
 const ids=new Set();
 for(const row of rows){
  const marker=/^(T\d{2}-\d{3}) /.exec(row.title??'');
  if(!marker||!expected.includes(marker[1])||ids.has(marker[1]))
   throw new Error('Unknown or duplicate actual R3-X PostgreSQL test case');
  if(row.status!=='passed'||!Array.isArray(row.failureMessages)||
     row.failureMessages.length!==0)
   throw new Error('Skipped or failed actual R3-X PostgreSQL case '+marker[1]);
  ids.add(marker[1]);
 }
 if(rows.length!==expected.length||
    report.numPassedTests!==expected.length||
    report.numFailedTests!==0||report.numPendingTests!==0||
    report.numTotalTests!==expected.length||
    report.success!==true)
  throw new Error('Actual PostgreSQL integration execution count mismatched');
 return [...ids].sort();
}
export function evidenceFor(report,source,reportText,runId,preflight){
 const expected=extractSourceCases(source);
 const actual=assertPostgresVitestReport(report,expected);
 if(preflight.schema!=='medsol-r3x-disposable-staging-preflight-v1'||
    preflight.runId!==runId||preflight.verdict!=='OFFLINE_DISPOSABLE_TEST_ALLOWED'||
    preflight.productionReady!==false)
  throw new Error('R3-X same-run staging preflight absent');
 return{
  schema:'medsol-r3x-real-postgres-execution-evidence-v1',
  runId,releaseVerdict:'NOT_CERTIFIED',
  evidenceClass:'ACTUAL_DISPOSABLE_POSTGRES_ENGINE_INTEGRATION_NOT_INDEPENDENT_STAGING_E2E',
  testFile:SOURCE,sourceSha256:hash(source),reportSha256:hash(reportText),
  preflightEvidenceDigest:preflight.evidenceDigest,
  actualPassedDatabaseCases:actual.length,caseIds:actual,
  independentOperatorSignoffs:0,
  realProviderAccountsConnected:0,
  liveOutboundMessages:0,
  productionSecurityCertifications:0
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1]};
 const f=arg('--input'),out=arg('--output');
 if(!f?.endsWith('.json')||!out?.endsWith('.json'))
  throw new Error('Explicit JSON test input/output required');
 const runId=process.env.GITHUB_RUN_ID;
 if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
    process.env.MARKETING_DB_INTEGRATION!=='1'||!runId||
    !/^\d{5,18}$/.test(runId))
  throw new Error('R3-X real PostgreSQL evidence requires active CI job');
 const preflight=JSON.parse(readFileSync('r3x-staging-preflight.json','utf8'));
 const reportText=readFileSync(f,'utf8');
 const evidence=evidenceFor(JSON.parse(reportText),
  readFileSync(SOURCE,'utf8'),reportText,runId,preflight);
 writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
 process.stdout.write(JSON.stringify({
  schema:evidence.schema,actualPassedDatabaseCases:evidence.actualPassedDatabaseCases,
  releaseVerdict:evidence.releaseVerdict
 },null,2)+'\n');
}
