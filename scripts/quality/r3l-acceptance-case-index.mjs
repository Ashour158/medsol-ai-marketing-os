#!/usr/bin/env node
/**
 * R3-S evidentiary event and incident isolation extends the authoritative R3-L 500-case blueprint evidence index.
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
 {id:'T14-001',testSource:'apps/api/src/model-reconciliation.test.ts'}
];
for(const {id,testSource} of extendedUnitCases){
 if(active.has(id)||!existsSync(testSource)||
  !readFileSync(testSource,'utf8').includes("it('"+id+' '))
  throw new Error('Model billing acceptance marker missing: '+id);
 active.set(id,{kind:'OFFLINE_UNIT_ASSERTION',testSource,
  contractEngine:'ModelReconciliationService',operatorSignoff:false,
  providerUatVerified:false});
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
if(active.size!==154)
 throw new Error('Expected precisely 154 mapped engineering cases, got '+active.size);
const verifiedInCi=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
 process.env.MARKETING_DB_INTEGRATION==='1'&&
 /^[0-9]{5,18}$/.test(process.env.GITHUB_RUN_ID||'')&&
 process.env.MARKETING_R3S_TEST_GATE_PASSED==='true';
// The same CI run must first prove the actual PostgreSQL FORCE RLS census.
const inventoryPath='r3n-rls-inventory.json';
let tenantRlsInventory=null;
if(verifiedInCi){
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
 schema:'medsol-r3s-events-500-case-acceptance-index-v1',
 runId:verifiedInCi?process.env.GITHUB_RUN_ID:null,
 evidenceScope:'CI_OFFLINE_UNIT_AND_DISPOSABLE_POSTGRES_NOT_INDEPENDENT_E2E',
 generatedAt:new Date().toISOString(),
 releaseVerdict:'NOT_CERTIFIED',
 tenantRlsInventory,
 plannedE2eCases:500,
 executedAndIndependentlySignedE2eCases:0,
 mappedOfflineUnitCases:111,
 mappedPostgresIntegrationCases:43,
 mappedEngineeringAssertions:154,
 unmappedPlannedCases:346,
 referenceCasesAssertedInThisCi:verifiedInCi?154:0,
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
