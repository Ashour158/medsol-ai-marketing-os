#!/usr/bin/env node
/**
 * R3-W Chromium fault/recovery execution evidence atop R3-V UI acceptance and R3-U authenticated BFF/API boundary and PostgreSQL guard acceptance extends the authoritative R3-L 500-case blueprint evidence index.
 * Evidence is PASS-eligible only after the repository's actual pnpm test
 * step succeeds in the same CI job. This register never claims 500 E2E.
 */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const PLAN=[
 ['T01','Tenant/agency isolation',35],
 ['T02','IAM/Settings/ABAC',30],
 ['T03','Policy/approval/audit',30],
 ['T04','Workflow compiler/runtime',35],
 ['T05','Agent/model orchestration',35],
 ['T06','MCP/A2A connectors',30],
 ['T07','Knowledge/learning',30],
 ['T08','Brand/product/pricing/loyalty',40],
 ['T09','Social/community/reputation',40],
 ['T10','Email/consent',45],
 ['T11','Brief/creative',25],
 ['T12','Market research/web',25],
 ['T13','Conversion/CRM/attribution',30],
 ['T14','Billing/FinOps',20],
 ['T15','Reliability/DR/incidents',30],
 ['T16','UX/accessibility/localization',20]
];
if(PLAN.reduce((sum,s)=>sum+s[2],0)!==500)
 throw new Error('Master 500-case blueprint allocation changed or incomplete');
const referencePath='apps/api/src/fixtures/r3l-acceptance-reference-set.json';
const suiteSource='apps/api/src/r3l-acceptance-reference-set.test.ts';
const reference=JSON.parse(readFileSync(referencePath,'utf8'));
if(reference.schema!=='medsol-r3l-acceptance-reference-v1'||
 !Array.isArray(reference.cases)||reference.cases.length!==110)
 throw new Error('Expected exact 110 explicit offline reference cases');
if(!existsSync(suiteSource)||
 !readFileSync(suiteSource,'utf8').includes('it.each(data.cases)'))
 throw new Error('Executable 110-case Vitest binding missing');
const active=new Map();
for(const item of reference.cases){
 const {id,suite,kind,parameters,expected,evidenceClass,owner}=item;
 const allocation=PLAN.find(s=>s[0]===suite);
 if(!allocation||!new RegExp('^'+suite+'-[0-9]{3}$').test(id)||
  Number(id.slice(4))<1||Number(id.slice(4))>allocation[2]||
  evidenceClass!=='OFFLINE_UNIT_ASSERTION'||
  !item.setup||!owner||!kind||!parameters||!expected||
  !Array.isArray(item.expectedDeniedSideEffects)||
  !item.expectedDeniedSideEffects.includes('no_real_provider_requests')||
  active.has(id))throw new Error('Ambiguous or unsupported mapped case '+id);
 active.set(id,{kind:'OFFLINE_UNIT_ASSERTION',
  testSource:suiteSource,contractEngine:item.trace,
  operatorSignoff:false,providerUatVerified:false});
}
const extendedUnitCases=[
 {id:'T14-001',testSource:'apps/api/src/model-reconciliation.test.ts'},
 ...['T03-025','T03-026','T03-027','T03-028'].map(id=>({
  id,testSource:'apps/api/src/r3u-route-authorization-matrix.test.ts'
 })),
 ...Array.from({length:8},(_,n)=>({
  id:'T16-'+String(n+1).padStart(3,'0'),
  testSource:'apps/web/src/app/api/marketing/[...path]/route.test.ts'
 }))
];
for(const {id,testSource} of extendedUnitCases){
 const testCode=existsSync(testSource)?readFileSync(testSource,'utf8'):'';
 if(active.has(id)||!(testCode.includes("it('"+id+" ")||
    testCode.includes('it("'+id+' ')))
  throw new Error('Executable offline/BFF acceptance marker missing: '+id);
 active.set(id,{kind:testSource.startsWith('apps/web/')?
   'SIMULATED_BFF_HANDLER_ASSERTION':'OFFLINE_UNIT_ASSERTION',testSource,
  contractEngine:testSource.includes('r3u-route')?
   'Central MarketingPermission registry':testSource.startsWith('apps/web/')?
   'Encrypted Next request handler + blocked internal egress':'ModelReconciliationService',
  operatorSignoff:false,providerUatVerified:false});
}
const databaseCases=[
 {id:'T01-001',testSource:'apps/api/src/postgres-r3l-agency-e2e.integration.test.ts'},
 {id:'T01-002',testSource:'apps/api/src/postgres-r3l-agency-e2e.integration.test.ts'},
 {id:'T15-017',testSource:'apps/api/src/postgres-r3l-multiworker-resilience.integration.test.ts'},
 {id:'T01-003',testSource:'apps/api/src/postgres-r3m-tenant-links-delegated-campaign.integration.test.ts'},
 {id:'T01-004',testSource:'apps/api/src/postgres-r3m-tenant-links-delegated-campaign.integration.test.ts'},
 {id:'T01-005',testSource:'apps/api/src/postgres-r3m-tenant-links-delegated-campaign.integration.test.ts'},
 {id:'T01-009',testSource:'apps/api/src/postgres-r3m-tenant-links-delegated-campaign.integration.test.ts'},
 {id:'T01-010',testSource:'apps/api/src/postgres-r3n-session-metrics-rls.integration.test.ts'},
 {id:'T01-011',testSource:'apps/api/src/postgres-r3p-campaign-catalog-learning-rls.integration.test.ts'},
 {id:'T01-012',testSource:'apps/api/src/postgres-r3p-campaign-catalog-learning-rls.integration.test.ts'},
 {id:'T01-013',testSource:'apps/api/src/postgres-r3q-iam-brain-workflow-rls.integration.test.ts'},
 {id:'T01-014',testSource:'apps/api/src/postgres-r3r-finops-rls.integration.test.ts'},
 {id:'T01-015',testSource:'apps/api/src/postgres-r3s-event-rls.integration.test.ts'},
 {id:'T01-016',testSource:'apps/api/src/postgres-r3t-outbox-rls.integration.test.ts'},
 ...['T01-017','T01-018','T01-019','T01-020','T03-029','T03-030',
  'T15-029','T15-030'].map(id=>({
  id,testSource:'apps/api/src/postgres-r3u-authenticated-guard.integration.test.ts'
 })),
 {id:'T15-027',testSource:'apps/api/src/postgres-r3t-outbox-rls.integration.test.ts'},
 {id:'T15-028',testSource:'apps/api/src/postgres-r3t-outbox-rls.integration.test.ts'},
 {id:'T03-023',testSource:'apps/api/src/postgres-r3s-event-rls.integration.test.ts'},
 {id:'T15-025',testSource:'apps/api/src/postgres-r3s-event-rls.integration.test.ts'},
 {id:'T14-002',testSource:'apps/api/src/postgres-r3r-finops-rls.integration.test.ts'},
 {id:'T04-034',testSource:'apps/api/src/postgres-r3q-iam-brain-workflow-rls.integration.test.ts'},
 {id:'T15-024',testSource:'apps/api/src/postgres-r3q-iam-brain-workflow-rls.integration.test.ts'},
 {id:'T13-002',testSource:'apps/api/src/postgres-r3n-session-metrics-rls.integration.test.ts'},
 {id:'T07-026',testSource:'apps/api/src/postgres-r3p-campaign-catalog-learning-rls.integration.test.ts'},
 {id:'T08-032',testSource:'apps/api/src/postgres-r3p-campaign-catalog-learning-rls.integration.test.ts'},
 {id:'T13-003',testSource:'apps/api/src/postgres-r3n-session-metrics-rls.integration.test.ts'},
 {id:'T08-031',testSource:'apps/api/src/postgres-r3o-full-offline-campaign-journey.integration.test.ts'},
 {id:'T15-022',testSource:'apps/api/src/postgres-r3n-session-metrics-rls.integration.test.ts'},
 {id:'T01-006',testSource:'apps/api/src/postgres-r2-publication-rls.integration.test.ts'},
 {id:'T01-007',testSource:'apps/api/src/postgres-r2e-signed-webhook.integration.test.ts'},
 {id:'T01-008',testSource:'apps/api/src/postgres-tenant-brand-agency.integration.test.ts'},
 {id:'T03-021',testSource:'apps/api/src/postgres-campaign.integration.test.ts'},
 {id:'T03-022',testSource:'apps/api/src/postgres-creative-assets.integration.test.ts'},
 {id:'T04-001',testSource:'apps/api/src/postgres-r3g-offline-dag.integration.test.ts'},
 {id:'T04-002',testSource:'apps/api/src/postgres-r3j-recovery-acceptance.integration.test.ts'},
 {id:'T04-003',testSource:'apps/api/src/postgres-blueprint-virtual.integration.test.ts'},
 {id:'T05-001',testSource:'apps/api/src/postgres-agent-multitenant.integration.test.ts'},
 {id:'T06-021',testSource:'apps/api/src/postgres-governed-tool-registry.integration.test.ts'},
 {id:'T07-025',testSource:'apps/api/src/postgres-r3i-memory-graph.integration.test.ts'},
 {id:'T09-001',testSource:'apps/api/src/postgres-r2-publication.integration.test.ts'},
 {id:'T10-001',testSource:'apps/api/src/postgres-synthetic-audience-email.integration.test.ts'},
 {id:'T11-001',testSource:'apps/api/src/postgres-creative-assets.integration.test.ts'},
 {id:'T13-001',testSource:'apps/api/src/postgres-marketing-performance.integration.test.ts'},
 {id:'T15-018',testSource:'apps/api/src/marketing-incident-response.integration.test.ts'},
 {id:'T15-019',testSource:'apps/api/src/postgres-r3j-recovery-acceptance.integration.test.ts'},
 {id:'T15-020',testSource:'apps/api/src/postgres-brain-crash-recovery.integration.test.ts'},
 {id:'T15-021',testSource:'apps/api/src/postgres-brain-crash-recovery.integration.test.ts'}
];
for(const {id,testSource} of databaseCases){
 if(active.has(id))throw new Error('Duplicate acceptance slot '+id);
 if(!existsSync(testSource)||
  !new RegExp("\\bit(?:\\.skipIf\\([^)]*\\))?\\s*\\(\\s*['\\\"]"+id+"\\s")
   .test(readFileSync(testSource,'utf8')))
  throw new Error('Real PostgreSQL acceptance test marker missing: '+id);
 active.set(id,{kind:'POSTGRES_INTEGRATION_ASSERTION',testSource,
  contractEngine:'Real PostgreSQL transactions and canonical owners',
  operatorSignoff:false,providerUatVerified:false});
}

const chromiumSource='apps/web/e2e/marketing-journey.pw.ts';
const chromiumCode=existsSync(chromiumSource)?readFileSync(chromiumSource,'utf8'):'';
const chromiumCases=["T16-009","T16-010","T16-011","T16-012","T16-013","T16-014","T16-015","T16-016","T16-017","T16-018","T16-019","T16-020","T01-021","T01-022","T10-002","T07-027","T09-002"];
for(const id of chromiumCases){
 if(active.has(id)||!(chromiumCode.includes("test('"+id+" ")||
                        chromiumCode.includes('test("'+id+' ')))
  throw new Error('Executable Chromium browser acceptance marker missing: '+id);
 active.set(id,{kind:'CHROMIUM_BROWSER_ASSERTION',testSource:chromiumSource,
  contractEngine:'Real Chromium + encrypted Next session + localhost-only synthetic API',
  operatorSignoff:false,providerUatVerified:false});
}
if(!existsSync('apps/web/playwright.config.ts')||
 !existsSync('apps/web/e2e/fixtures/simulated-upstream.mjs'))
 throw new Error('Actual browser runner and offline upstream fixture missing');

const r3wSource='apps/web/e2e/r3w-chaos-recovery.pw.ts';
const r3wCode=existsSync(r3wSource)?readFileSync(r3wSource,'utf8'):'';
const r3wCases=["T01-023","T01-024","T01-025","T01-026","T01-027","T01-028","T04-004","T04-005","T04-006","T04-007","T05-002","T05-003","T06-022","T07-028","T07-029","T07-030","T08-003","T09-003","T09-004","T09-005","T09-006","T09-007","T10-003","T10-004","T10-005","T10-006","T11-002","T11-003","T11-004","T12-001","T13-004","T13-005","T15-023","T15-026"];
for(const id of r3wCases){
 if(active.has(id)||!(r3wCode.includes("test('"+id+" ")||
                        r3wCode.includes('test("'+id+' ')))
  throw new Error('R3-W Chromium chaos test marker missing: '+id);
 active.set(id,{kind:'CHROMIUM_CHAOS_RECOVERY_ASSERTION',testSource:r3wSource,
  contractEngine:'Real Chromium browser + production Next BFF + offline chaos/recovery fixture',
  operatorSignoff:false,providerUatVerified:false});
}

const r3xSource='apps/api/src/postgres-r3x-cross-engine-staging.integration.test.ts';
const r3xSourceCode=existsSync(r3xSource)?readFileSync(r3xSource,'utf8'):'';
const r3xCases=["T01-029","T01-030","T01-031","T01-032","T01-033","T01-034","T01-035","T04-008","T04-009","T04-010","T04-011","T05-004","T05-005","T05-006","T08-004","T08-005","T08-006","T09-008","T09-009","T09-010","T10-007","T10-008","T10-009","T12-002","T12-003","T13-006","T13-007","T13-008","T13-009","T13-010","T13-011","T13-012","T13-013","T13-014","T14-003","T14-004","T14-005"];
for(const id of r3xCases){
 if(active.has(id)||!(r3xSourceCode.includes("it('"+id+" ")||
                        r3xSourceCode.includes('it("'+id+' ')))
  throw new Error('R3-X real PostgreSQL cross-engine case marker missing: '+id);
 active.set(id,{kind:'POSTGRES_CROSS_ENGINE_ASSERTION',testSource:r3xSource,
  contractEngine:'Real migrated PostgreSQL two-tenant transactions via canonical owners',
  operatorSignoff:false,providerUatVerified:false});
}

const r3ySource='apps/web/e2e/r3y-real-stack.pw.ts';
const r3yCode=existsSync(r3ySource)?readFileSync(r3ySource,'utf8'):'';
const r3yCases=["T08-007","T04-012","T04-013","T03-024","T05-007","T11-005","T11-006","T09-011","T09-012","T10-010","T10-011","T12-004","T13-015","T14-006","T06-023","T04-014","T04-015","T04-016","T09-013"];
for(const id of r3yCases){
 if(active.has(id)||!(r3yCode.includes("test('"+id+" ")||
                        r3yCode.includes('test("'+id+' ')))
  throw new Error('R3-Y real-stack browser case marker missing: '+id);
 active.set(id,{kind:'CHROMIUM_REAL_NEXT_NEST_POSTGRES_ASSERTION',testSource:r3ySource,
  contractEngine:'Production-built HTTPS Next BFF to compiled Nest with signed local JWKS, real tenant sessions and FORCE RLS PostgreSQL',
  operatorSignoff:false,providerUatVerified:false});
}
if(active.size!==284)
 throw new Error('Expected precisely 284 mapped engineering cases, got '+active.size);
const verifiedInCi=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
 process.env.MARKETING_DB_INTEGRATION==='1'&&
 /^[0-9]{5,18}$/.test(process.env.GITHUB_RUN_ID||'')&&
 process.env.MARKETING_R3U_TEST_GATE_PASSED==='true'&&
 process.env.MARKETING_R3V_BROWSER_GATE_PASSED==='true'&&
 process.env.MARKETING_R3W_BROWSER_GATE_PASSED==='true'&&
 process.env.MARKETING_R3X_POSTGRES_GATE_PASSED==='true'&&
 process.env.MARKETING_R3Y_REAL_STACK_GATE_PASSED==='true';
// The same CI run must first prove the actual PostgreSQL FORCE RLS census.
const inventoryPath='r3n-rls-inventory.json';
let tenantRlsInventory=null;
let browserExecutionEvidence=null;
let postgresExecutionEvidence=null;
let stagingPreflightEvidence=null;
let realStackExecutionEvidence=null;
if(verifiedInCi){
 const r3yPath='r3y-real-stack-evidence.json',rolePath='r3y-runtime-role-evidence.json';
 if(!existsSync(r3yPath)||!existsSync(rolePath))
  throw new Error('Missing R3-Y actual real-stack browser and role evidence');
 const real=JSON.parse(readFileSync(r3yPath,'utf8'));
 const role=JSON.parse(readFileSync(rolePath,'utf8'));
 const r3yExpectedIds=[...r3yCases].sort();
 if(real.schema!=='medsol-r3y-real-stack-actual-browser-evidence-v1'||
    real.runId!==process.env.GITHUB_RUN_ID||real.releaseVerdict!=='NOT_CERTIFIED'||
    real.actualPassedRealStackCases!==19||!Array.isArray(real.caseIds)||
    JSON.stringify(real.caseIds)!==JSON.stringify(r3yExpectedIds)||
    real.database!=='real_migrated_postgres_non_bypassrls_app_role'||
    real.api!=='compiled_real_nest_server'||real.runtimeRoleVerified!==true||
    real.independentOperatorSignatures!==0||real.realEntraProviderConnected!==false||
    real.actualProviderCredentials!==0||real.realMessagesSent!==0||
    real.realSocialPosts!==0||real.productionSecurityCertified!==false||
    role.schema!=='medsol-r3y-runtime-role-rls-proof-v1'||
    role.runId!==process.env.GITHUB_RUN_ID||
    role.verdict!=='DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED'||
    role.superuser!==false||role.bypassRls!==false||
    role.noTenantRowsVisible!==0||role.tenantARowsVisible!==3||
    role.tenantBRowsVisible!==1)
  throw new Error('R3-Y actual real API / unprivileged RLS acceptance mismatch');
 realStackExecutionEvidence={
  runId:real.runId,actualPassedRealStackCases:19,reportSha256:real.reportSha256,
  realNest:true,realPostgresql:true,syntheticLocalOidcOnly:true,independentOperatorSignoff:false
 };

 const pgPath='r3x-postgres-evidence.json',stagePath='r3x-staging-preflight.json';
 if(!existsSync(pgPath)||!existsSync(stagePath))
  throw new Error('R3-X same-run PostgreSQL/staging execution evidence missing');
 const pg=JSON.parse(readFileSync(pgPath,'utf8'));
 const stage=JSON.parse(readFileSync(stagePath,'utf8'));
 const expectedPgCases=[...r3xCases].sort();
 if(pg.schema!=='medsol-r3x-real-postgres-execution-evidence-v1'||
    pg.runId!==process.env.GITHUB_RUN_ID||
    pg.releaseVerdict!=='NOT_CERTIFIED'||pg.actualPassedDatabaseCases!==37||
    pg.independentOperatorSignoffs!==0||pg.realProviderAccountsConnected!==0||
    pg.liveOutboundMessages!==0||!Array.isArray(pg.caseIds)||
    JSON.stringify(pg.caseIds)!==JSON.stringify(expectedPgCases)||
    stage.schema!=='medsol-r3x-disposable-staging-preflight-v1'||
    stage.runId!==process.env.GITHUB_RUN_ID||
    stage.verdict!=='OFFLINE_DISPOSABLE_TEST_ALLOWED'||
    stage.productionReady!==false||
    stage.actualExternalPublishAndEmailAllowed!==false||
    stage.database?.forceRlsTables!==47||
    pg.preflightEvidenceDigest!==stage.evidenceDigest)
  throw new Error('R3-X cross-engine PostgreSQL execution and staging proofs mismatch');
 postgresExecutionEvidence={runId:pg.runId,actualPassedDatabaseCases:37,
  reportSha256:pg.reportSha256,sourceSha256:pg.sourceSha256,
  independentOperatorSignoff:false};
 stagingPreflightEvidence={runId:stage.runId,verdict:stage.verdict,
  productionReady:false,externalEffectsAuthorized:false};

 const browserPath='r3w-browser-evidence.json';
 if(!existsSync(browserPath))throw new Error('Missing same-run Chromium runtime evidence');
 const browser=JSON.parse(readFileSync(browserPath,'utf8'));
 const ids=[...chromiumCases,...r3wCases].sort();
 if(browser.schema!=='medsol-r3w-chromium-execution-evidence-v1'||
    browser.runId!==process.env.GITHUB_RUN_ID||
    browser.releaseVerdict!=='NOT_CERTIFIED'||browser.operatorSignedOff!==false||
    browser.independentlySignedE2eCases!==0||
    browser.realProviderCalls!==0||browser.realEmailSends!==0||
    browser.realSocialPosts!==0||
    browser.actualExecutedBrowserCases!==51||browser.browserPassedCases!==51||
    !Array.isArray(browser.caseIds)||JSON.stringify(browser.caseIds)!==JSON.stringify(ids))
  throw new Error('R3-W Chromium actual execution report does not match same-run source inventory');
 browserExecutionEvidence={
  runId:browser.runId,passedCases:51,reportSha256:browser.reportSha256,
  independentOperatorSignoff:false,providerUatVerified:false
 };

 if(!existsSync(inventoryPath))throw new Error('Missing same-run R3-N RLS inventory');
 const inventory=JSON.parse(readFileSync(inventoryPath,'utf8'));
 if(inventory.schema!=='medsol-r3n-postgresql-tenant-rls-inventory-v1'||
    inventory.runId!==process.env.GITHUB_RUN_ID||
    inventory.status!=='DISPOSABLE_CI_INVENTORY_PASSED'||
    inventory.releaseVerdict!=='NOT_CERTIFIED'||
    !Number.isInteger(inventory.uncoveredTenantTableCount))
  throw new Error('RLS inventory was not verified against the current CI database');
 tenantRlsInventory={
  tableCount:inventory.tenantTableCount,
  forceRlsTenantTableCount:inventory.forceRlsTenantTableCount,
  uncoveredTenantTableCount:inventory.uncoveredTenantTableCount,
  productionCertified:false
 };
}
const cases=[];
for(const [suite,area,count] of PLAN){
 for(let n=1;n<=count;n++){
  const id=suite+'-'+String(n).padStart(3,'0');
  const evidence=active.get(id);
  cases.push({
   id,suite,area,
   engineeringEvidence:evidence?{
    ...evidence,status:verifiedInCi?'CI_ASSERTED':'NOT_YET_CI_ASSERTED',
    productionE2eCoverage:false
   }:null,
   target500E2eCaseStatus:'UNEXECUTED',
   independentlySignedOff:false,
   externalEffectsAuthorized:false
  });
 }
}
const result={
 schema:'medsol-r3y-real-stack-500-case-acceptance-index-v1',
 runId:verifiedInCi?process.env.GITHUB_RUN_ID:null,
 evidenceScope:'CI_OFFLINE_UNIT_51_SIMULATED_OWNER_CHROMIUM_19_REAL_NEST_POSTGRES_CHROMIUM_91_POSTGRES_CASES_NOT_INDEPENDENT_STAGING_E2E',
 generatedAt:new Date().toISOString(),
 releaseVerdict:'NOT_CERTIFIED',
 tenantRlsInventory,
 browserExecutionEvidence,
 postgresExecutionEvidence,
 stagingPreflightEvidence,
 realStackExecutionEvidence,
 plannedE2eCases:500,
 executedAndIndependentlySignedE2eCases:0,
 mappedOfflineUnitCases:123,
 mappedPostgresIntegrationCases:91,
 mappedChromiumBrowserCases:70,
 mappedEngineeringAssertions:284,
 unmappedPlannedCases:216,
 referenceCasesAssertedInThisCi:verifiedInCi?284:0,
 providerAccountsTested:0,
 realPublishOrEmailSendCount:0,
 irreversibleRealSideEffects:0,
 independentPenetrationTestPassed:false,
 productionRtoRpoCertified:false,
 automaticallyWavable:false,
 totalCases:cases.length,
 suiteSummaries:PLAN.map(([suite,area,planned])=>({
  suite,area,planned,offlineEvidenceMapped:cases.filter(c=>
   c.suite===suite&&!!c.engineeringEvidence).length,
  independentlyAcceptedE2e:0
 })),
 cases
};
if(cases.length!==500||new Set(cases.map(c=>c.id)).size!==500||
 result.suiteSummaries.some(s=>s.offlineEvidenceMapped>s.planned))
 throw new Error('500-case coverage register inconsistency');
const outputPath=process.argv[2]==='--output'?process.argv[3]:null;
if(outputPath&&typeof outputPath==='string'){
 const target=resolve(outputPath);
 if(!target.endsWith('.json'))throw new Error('Only JSON evidence is supported');
 writeFileSync(target,JSON.stringify(result,null,2)+'\n');
}
process.stdout.write(JSON.stringify({
 ...Object.fromEntries(Object.entries(result).filter(([k])=>k!=='cases')),
 evidenceIndexFile:outputPath??null
},null,2)+'\n');
