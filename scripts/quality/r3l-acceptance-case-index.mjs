#!/usr/bin/env node
/**
 * R3-L authoritatively enumerates the planned 500-case blueprint.
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
const databaseCases=[
 {id:'T01-001',testSource:'apps/api/src/postgres-r3l-agency-e2e.integration.test.ts'},
 {id:'T01-002',testSource:'apps/api/src/postgres-r3l-agency-e2e.integration.test.ts'},
 {id:'T15-017',testSource:'apps/api/src/postgres-r3l-multiworker-resilience.integration.test.ts'}
];
for(const {id,testSource} of databaseCases){
 if(active.has(id))throw new Error('Duplicate acceptance slot '+id);
 if(!existsSync(testSource)||!readFileSync(testSource,'utf8').includes("it('"+id+' '))
  throw new Error('Real PostgreSQL acceptance test marker missing: '+id);
 active.set(id,{kind:'POSTGRES_INTEGRATION_ASSERTION',testSource,
  contractEngine:'Real PostgreSQL transactions and canonical owners',
  operatorSignoff:false,providerUatVerified:false});
}
if(active.size!==113)
 throw new Error('Expected precisely 113 mapped offline cases, got '+active.size);
const verifiedInCi=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
 process.env.MARKETING_DB_INTEGRATION==='1'&&
 /^[0-9]{5,18}$/.test(process.env.GITHUB_RUN_ID||'')&&
 process.env.MARKETING_R3L_TEST_GATE_PASSED==='true';
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
 schema:'medsol-r3l-500-case-acceptance-index-v1',
 runId:verifiedInCi?process.env.GITHUB_RUN_ID:null,
 evidenceScope:'CI_OFFLINE_UNIT_AND_DISPOSABLE_POSTGRES_NOT_INDEPENDENT_E2E',
 generatedAt:new Date().toISOString(),
 releaseVerdict:'NOT_CERTIFIED',
 plannedE2eCases:500,
 executedAndIndependentlySignedE2eCases:0,
 mappedOfflineUnitCases:110,
 mappedPostgresIntegrationCases:3,
 mappedEngineeringAssertions:113,
 unmappedPlannedCases:387,
 referenceCasesAssertedInThisCi:verifiedInCi?113:0,
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
const outputPath=process.argv[1]==='--output'?process.argv[2]:null;
if(outputPath&&typeof outputPath==='string'){
 const target=resolve(outputPath);
 if(!target.endsWith('.json'))throw new Error('Only JSON evidence is supported');
 writeFileSync(target,JSON.stringify(result,null,2)+'\n');
}
process.stdout.write(JSON.stringify({
 ...Object.fromEntries(Object.entries(result).filter(([k])=>k!=='cases')),
 evidenceIndexFile:outputPath??null
},null,2)+'\n');
