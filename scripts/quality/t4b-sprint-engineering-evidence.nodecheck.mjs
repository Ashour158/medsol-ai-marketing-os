import {test} from "node:test";
import assert from "node:assert/strict";
import {verifySprintEvidence} from "./t4b-sprint-engineering-evidence.mjs";
const run={id:"12345678",commit:"a".repeat(40)};
const entries=()=>{
 const definitions=[
  ["rls","medsol-r3n-postgresql-tenant-rls-inventory-v1"],
  ["staging","medsol-r3x-disposable-staging-preflight-v1"],
  ["postgres","medsol-r3x-real-postgres-execution-evidence-v1"],
  ["syntheticBrowser","medsol-r3w-chromium-execution-evidence-v1"],
  ["realStackBrowser","medsol-r3y-real-stack-actual-browser-evidence-v1"],
  ["operatorBrowser","medsol-t1f-real-operator-journey-browser-evidence-v1"],
  ["signedDagBrowser","medsol-t3c-signed-dag-operator-evidence-v1"],
  ["knowledgeDagBrowser","medsol-t3d-knowledge-dag-browser-evidence-v1"],
  ["creativeBrowser","medsol-t4a-signed-offline-creative-browser-evidence-v1"],
  ["handoff","medsol-r3y-independent-operator-handoff-v1"]
 ];
 const e=Object.fromEntries(definitions.map(([key,schema])=>
  [key,{digest:"sha256:"+"b".repeat(64),
   data:{schema,runId:run.id,releaseVerdict:"NOT_CERTIFIED"}}]));
 Object.assign(e.rls.data,{status:"DISPOSABLE_CI_INVENTORY_PASSED",
  tenantTableCount:48,forceRlsTenantTableCount:48,uncoveredTenantTableCount:0});
 Object.assign(e.staging.data,{verdict:"OFFLINE_DISPOSABLE_TEST_ALLOWED",
  actualExternalPublishAndEmailAllowed:false,productionReady:false});
 const set=(name,field,ids)=>Object.assign(e[name].data,{
  [field]:ids.length,caseIds:ids});
 set("postgres","actualPassedDatabaseCases",Array.from({length:37},(_,i)=>"DB-"+i));
 set("syntheticBrowser","actualExecutedBrowserCases",Array.from({length:51},(_,i)=>"WEB-"+i));
 set("realStackBrowser","actualPassedRealStackCases",Array.from({length:19},(_,i)=>"REAL-"+i));
 set("operatorBrowser","actualPassingSignedOperatorJourneys",Array.from({length:5},(_,i)=>"T17-00"+(i+1)));
 set("signedDagBrowser","actualPassingBrowserCases",["T18-001","T18-002","T18-003","T18-004"]);
 set("knowledgeDagBrowser","actualPassingBrowserCases",["T19-001","T19-002","T19-003"]);
 set("creativeBrowser","actualPassingBrowserCases",["T20-001","T20-002"]);
 Object.assign(e.postgres.data,{independentOperatorSignoffs:0});
 Object.assign(e.syntheticBrowser.data,{independentlySignedE2eCases:0});
 Object.assign(e.realStackBrowser.data,{independentOperatorSignatures:0,actualProviderCredentials:0});
 Object.assign(e.operatorBrowser.data,{independentlySigned500CaseCount:0,providerAccountsConnected:0});
 Object.assign(e.signedDagBrowser.data,{independent500CaseHumanQa:0,externalEffectsAuthorized:false});
 Object.assign(e.knowledgeDagBrowser.data,{independentlySigned500CaseQa:0,externalEffectsAuthorized:false});
 Object.assign(e.creativeBrowser.data,{independentlySigned500CaseQA:0,realCreativeAIProviderCalls:0,cases:["T20-001","T20-002"]});
 Object.assign(e.handoff.data,{plannedCases:500,engineeringBaselineMapped:284,
  stillUnmappedForEngineering:216,independentlyExecutedStagingCases:0,
  independentlyAcceptedCases:0,releaseAuthorizationIssued:false,
  authenticProviderUatPerformed:false,productionDatabaseInspected:false,
  signatures:[],caseRecords:Array.from({length:500},(_,i)=>({
   id:"T"+String(i+1).padStart(3,"0"),outcome:"NOT_EXECUTED",
   independentlySignedOff:false
  }))});
 return e;
};
test("T4B emits honest same-run CI engineering handoff without release certification",()=>{
 const a=verifySprintEvidence(entries(),run);
 assert.equal(a.releaseVerdict,"NOT_CERTIFIED");
 assert.equal(a.verifiedSameRunEngineeringProofs,10);
 assert.equal(a.actualPassedIsolatedPostgresqlCases,37);
 assert.equal(a.actualPassedChromiumCasesAcrossIndependentSuites,84);
 assert.equal(a.signedOperatorIntegratedJourney.caseId,"T17-001");
 assert.equal(a.signedOperatorIntegratedJourney.independentOperatorCertification,false);
 assert.equal(a.independentlySignedE2eCases,0);
 assert.equal(a.actualPersistentStagingDeployed,false);
 assert.equal(a.productionReady,false);
});
test("T4B rejects missing, cross-run, cross-commit and forged non-certifying evidence",()=>{
 const missing=entries();delete missing.operatorBrowser;
 assert.throws(()=>verifySprintEvidence(missing,run),/same-run/);
 const other=entries();other.creativeBrowser.data.runId="12345679";
 assert.throws(()=>verifySprintEvidence(other,run),/same-run/);
 const commit=entries();commit.operatorBrowser.data.commit="c".repeat(40);
 assert.throws(()=>verifySprintEvidence(commit,run),/cross-commit/);
 const cert=entries();cert.handoff.data.releaseVerdict="CERTIFIED";
 assert.throws(()=>verifySprintEvidence(cert,run),/certification/);
 const digest=entries();digest.rls.digest="non-hex";
 assert.throws(()=>verifySprintEvidence(digest,run),/same-run/);
});
test("T4B rejects unverified RLS, fake independent QA, provider activity and missing cases",()=>{
 const rls=entries();rls.rls.data.uncoveredTenantTableCount=1;
 assert.throws(()=>verifySprintEvidence(rls,run),/FORCE RLS/);
 const qa=entries();qa.handoff.data.independentlyAcceptedCases=500;
 assert.throws(()=>verifySprintEvidence(qa,run),/independent QA/);
 const egress=entries();egress.signedDagBrowser.data.externalEffectsAuthorized=true;
 assert.throws(()=>verifySprintEvidence(egress,run),/external effect/);
 const browser=entries();browser.realStackBrowser.data.caseIds.pop();
 assert.throws(()=>verifySprintEvidence(browser,run),/count/);
 const fakeHandoff=entries();fakeHandoff.handoff.data.caseRecords[0].independentlySignedOff=true;
 assert.throws(()=>verifySprintEvidence(fakeHandoff,run),/handoff/);
 const substituted=entries();substituted.operatorBrowser.data.caseIds[0]="OP-000";
 assert.throws(()=>verifySprintEvidence(substituted,run),/full-journey/);
 const missingDag=entries();missingDag.signedDagBrowser.data.caseIds.pop();
 assert.throws(()=>verifySprintEvidence(missingDag,run),/signed DAG/);
});
