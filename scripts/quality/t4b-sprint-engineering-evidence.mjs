#!/usr/bin/env node
/**
 * Seven-day sprint CI evidence manifest: checks SAME-RUN existing authoritative
 * real PostgreSQL/browser/identity proofs. This is an engineering handoff, NOT
 * independent staging UAT, production certification, or a substitute for
 * production-release-certification.mjs.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const sha=t=>"sha256:"+createHash("sha256").update(t).digest("hex");
const fail=m=>{throw Error("T4B_ENGINEERING_HANDOFF_BLOCKED: "+m);};
const specs=[
 ["rls","r3n-rls-inventory.json","medsol-r3n-postgresql-tenant-rls-inventory-v1"],
 ["staging","r3x-staging-preflight.json","medsol-r3x-disposable-staging-preflight-v1"],
 ["postgres","r3x-postgres-evidence.json","medsol-r3x-real-postgres-execution-evidence-v1"],
 ["syntheticBrowser","r3w-browser-evidence.json","medsol-r3w-chromium-execution-evidence-v1"],
 ["realStackBrowser","r3y-real-stack-evidence.json","medsol-r3y-real-stack-actual-browser-evidence-v1"],
 ["operatorBrowser","t1f-signed-operator-evidence.json","medsol-t1f-real-operator-journey-browser-evidence-v1"],
 ["signedDagBrowser","t3c-dag-evidence.json","medsol-t3c-signed-dag-operator-evidence-v1"],
 ["knowledgeDagBrowser","t3d-knowledge-dag-evidence.json","medsol-t3d-knowledge-dag-browser-evidence-v1"],
 ["creativeBrowser","t4a-creative-evidence.json","medsol-t4a-signed-offline-creative-browser-evidence-v1"],
 ["handoff","r3y-operator-handoff.json","medsol-r3y-independent-operator-handoff-v1"]
];
export function verifySprintEvidence(entries,run){
 if(!/^\d{5,18}$/.test(run?.id??"")||!/^[a-f0-9]{40}$/.test(run?.commit??""))
  fail("exact real CI run and commit required");
 const e={};
 for(const [id,,schema] of specs){
  const source=entries?.[id];
  if(!source||source.data?.schema!==schema||
     source.data.runId!==run.id||
     !/^sha256:[a-f0-9]{64}$/.test(source.digest??""))
   fail("same-run evidence absent, malformed or misidentified: "+id);
  if(source.data.releaseVerdict!=="NOT_CERTIFIED")
   fail("evidence attempts certification or omits noncertified status: "+id);
  if(source.data.commit!==undefined&&source.data.commit!==run.commit)
   fail("cross-commit evidence refused: "+id);
  e[id]=source.data;
 }
 if(e.rls.status!=="DISPOSABLE_CI_INVENTORY_PASSED"||
    e.rls.tenantTableCount!==46||e.rls.forceRlsTenantTableCount!==46||
    e.rls.uncoveredTenantTableCount!==0)
  fail("actual 46-table FORCE RLS census absent");
 if(e.staging.verdict!=="OFFLINE_DISPOSABLE_TEST_ALLOWED"||
    e.staging.actualExternalPublishAndEmailAllowed!==false||
    e.staging.productionReady!==false)
  fail("disposable no-provider preflight absent");
 const checks=[
  ["postgres",37,"actualPassedDatabaseCases"],
  ["syntheticBrowser",51,"actualExecutedBrowserCases"],
  ["realStackBrowser",19,"actualPassedRealStackCases"],
  ["operatorBrowser",5,"actualPassingSignedOperatorJourneys"],
  ["knowledgeDagBrowser",3,"actualPassingBrowserCases"],
  ["creativeBrowser",2,"actualPassingBrowserCases"]
 ];
 for(const [name,expected,field] of checks)
  if(e[name][field]!==expected||!Array.isArray(e[name].caseIds??e[name].cases)||
     (e[name].caseIds??e[name].cases).length!==expected)
   fail("real executed case count/provenance mismatch for "+name);
 const dagCount=e.signedDagBrowser.actualPassingBrowserCases;
 if(!Number.isSafeInteger(dagCount)||dagCount<3||dagCount>32||
    !Array.isArray(e.signedDagBrowser.caseIds)||
    e.signedDagBrowser.caseIds.length!==dagCount)
  fail("signed DAG Chromium evidence absent");
 const noClaims=[
  e.postgres.independentOperatorSignoffs===0,
  e.syntheticBrowser.independentlySignedE2eCases===0,
  e.realStackBrowser.independentOperatorSignatures===0,
  e.operatorBrowser.independentlySigned500CaseCount===0,
  e.signedDagBrowser.independent500CaseHumanQa===0,
  e.knowledgeDagBrowser.independentlySigned500CaseQa===0,
  e.creativeBrowser.independentlySigned500CaseQA===0,
  e.handoff.independentlyExecutedStagingCases===0,
  e.handoff.independentlyAcceptedCases===0,
  e.handoff.productionReady!==true
 ];
 if(noClaims.some(x=>!x))fail("invalid independent QA claims or staging proof");
 if(e.handoff.plannedE2eCases!==500&&e.handoff.plannedCases!==500){
  // The handoff may carry its 500-case allocation as actual case rows instead.
  if(!Array.isArray(e.handoff.cases)||e.handoff.cases.length!==500)
   fail("canonical 500-slot unsigned independent handoff absent");
 }
 if(e.operatorBrowser.providerAccountsConnected!==0||
    e.realStackBrowser.actualProviderCredentials!==0||
    e.creativeBrowser.realCreativeAIProviderCalls!==0||
    e.signedDagBrowser.externalEffectsAuthorized!==false||
    e.knowledgeDagBrowser.externalEffectsAuthorized!==false)
  fail("external effect or provider account proof invalid");
 const proofFiles=Object.fromEntries(specs.map(([name,path])=>
  [name,{file:path,sha256:entries[name].digest}]));
 const browserCases=51+19+5+dagCount+3+2;
 return{
  schema:"medsol-t4b-seven-day-offline-engineering-handoff-v1",
  runId:run.id,commit:run.commit,releaseVerdict:"NOT_CERTIFIED",
  evidenceClassification:"ACTUAL_DISPOSABLE_GITHUB_CI_NOT_INDEPENDENT_STAGING_UAT",
  verifiedSameRunEngineeringProofs:specs.length,
  postgresqlTenantTablesWithForceRls:46,uncoveredTenantTables:0,
  actualPassedIsolatedPostgresqlCases:37,
  actualPassedChromiumCasesAcrossIndependentSuites:browserCases,
  canonicalPlannedIndependentE2eCases:500,
  independentlyExecutedStagingE2eCases:0,independentlySignedE2eCases:0,
  actualPersistentStagingDeployed:false,
  realSocialPosts:0,realEmailsSent:0,realModelProviderCalls:0,
  externalEffectsAuthorized:false,productionReady:false,
  proofs:proofFiles,
  nextIndependentGates:[
   "Persistent secured staging with separately operated IdP and tenant-scoped role",
   "Independent 500-case operator execution and five distinct approved signatories",
   "Independent pen-test, backups/PITR/restore/RTO/RPO, accessibility and rollback",
   "Explicit eligible-provider sandbox UAT and official receipt reconciliation"
  ]
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const outIndex=process.argv.indexOf("--output");
 if(outIndex<0||!process.argv[outIndex+1]?.endsWith(".json")||
    process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
    process.env.MARKETING_T4B_EVIDENCE_CI_ONLY!=="1")
  fail("only real GitHub CI with explicit JSON output may assemble evidence");
 const entries=Object.fromEntries(specs.map(([name,path])=>{
  const raw=readFileSync(path,"utf8");
  return [name,{data:JSON.parse(raw),digest:sha(raw)}];
 }));
 const proof=verifySprintEvidence(entries,{
  id:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA
 });
 writeFileSync(process.argv[outIndex+1],JSON.stringify(proof,null,2)+"\n");
 process.stdout.write(JSON.stringify({schema:proof.schema,releaseVerdict:proof.releaseVerdict,
  actualPassedChromiumCasesAcrossIndependentSuites:proof.actualPassedChromiumCasesAcrossIndependentSuites,
  independentlySignedE2eCases:0})+"\n");
}
