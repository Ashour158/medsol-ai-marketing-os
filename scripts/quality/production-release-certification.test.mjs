import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyReleaseCertification,verifyPersistentStagingEvidence,digest} from './production-release-certification.mjs';

const hex='sha256:'+'f'.repeat(64);
const commit='a'.repeat(40);
const roles=['INDEPENDENT_QA','INDEPENDENT_PENTEST',
 'PLATFORM_SECURITY','DISASTER_RECOVERY','BUSINESS_OWNER'];
const canonical=value=>JSON.stringify(value,(_key,item)=>{
 if(!item||typeof item!=='object'||Array.isArray(item))return item;
 return Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)));
});
function sample(){
 const allocation=[35,30,30,35,35,30,30,40,40,45,25,25,30,20,30,20];
 const caseIds=allocation.flatMap((count,index)=>
  Array.from({length:count},(_,i)=>'T'+String(index+1).padStart(2,'0')+
   '-'+String(i+1).padStart(3,'0')));
 const cases=caseIds.map((id,i)=>({
  id,
  status:'PASS',evidenceClass:'INDEPENDENT_E2E',artifactDigest:hex,
  operatorId:i%2?'synthetic_operator_b':'synthetic_operator_a',
  runId:'synthetic-run-'+i,executedAt:'2026-11-20T00:00:00Z',
  triageReference:'synthetic-triage-'+i
 }));
 const index={schema:'medsol-r3y-real-stack-500-case-acceptance-index-v1',
  plannedE2eCases:500,cases:cases.map(({id})=>({id})),
  releaseVerdict:'NOT_CERTIFIED'};
 const payload={
  releaseClass:'PRODUCTION',repository:'Ashour158/medsol-ai-marketing-os',
  commit,environment:'production',deploymentId:'synthetic-disposable-probe',
  externalEffectsAuthorized:true,cases,
  canonicalCaseIndexDigest:digest(index.cases.map(c=>c.id)),
  staging:{
   schema:'medsol-independent-staging-evidence-v1',
   environment:'persistent-staging',commit,
   httpsOrigin:'https://synthetic-operator-staging.org',
   providerEgressDisabled:true,actualDeploymentObserved:true,
   separatelyOperatedOidcMfaVerified:true,tenantAgencyIsolationPassed:true,
   nonBypassRlsAppRoleProven:true,tlsChainIndependentlyVerified:true,
   backupRestoreAndRollbackObserved:true,
   immutableImageDigest:hex,operatorProofDigest:hex,
   independentOperatorId:'synthetic-operator',
   firstIndependentCheckAt:new Date(Date.now()-48*3600000).toISOString(),
   lastIndependentCheckAt:new Date(Date.now()-3600000).toISOString()
  },
  database:{allTenantOwnedTablesForceRls:true,uncoveredTenantTables:0,
   applicationRoleBypassRls:false,sessionContextIsolationPassed:true,
   censusArtifactDigest:hex,environment:'production'},
  security:{independentPentestPassed:true,unresolvedCritical:0,unresolvedHigh:0,
   pentestReportDigest:hex,secretsAndKeyRotationValidated:true,
   supplyChainAndSastValidated:true},
  recovery:{restoreAndPitrPassed:true,actualRtoRpoWithinApprovedLimits:true,
   recoveryEvidenceDigest:hex,independentObserverId:'synthetic-dr-person'},
  providers:{stagingEntitlementsVerified:true,officialAdapterReconciliationPassed:true,
   zeroUnauthorizedExternalEffects:true,uatArtifactDigest:hex},
  operability:{oncallReceiverVerified:true,rollbackRehearsalPassed:true,
   killSwitchRehearsalPassed:true,consentAndPrivacyReviewPassed:true},
  codeAuthorId:'synthetic-author'
 };
 const pairs=roles.map((role,i)=>{
  const pair=generateKeyPairSync('ed25519');
  return{role,keyId:'synthetic-key-'+i,personId:'independent-'+i,
   publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),
   privateKey:pair.privateKey};
 });
 const trust={schema:'medsol-external-release-trust-v1',
  keys:pairs.map(({role,keyId,personId,publicKeyPem})=>
   ({role,keyId,personId,publicKeyPem}))};
 const certificate=()=>({schema:'medsol-release-certification-v1',
  payload,signatures:pairs.map(k=>({keyId:k.keyId,algorithm:'Ed25519',
   sig:sign(null,Buffer.from(canonical(payload)),k.privateKey).toString('base64')}))});
 return{payload,index,trust,certificate,pairs};
}
test('checker validates exact detached Ed25519 multi-person evidence schema (synthetic fixture only)',()=>{
 const v=sample(),res=verifyReleaseCertification(v.certificate(),v.trust,v.index,commit);
 assert.equal(res.independentlyExecutedE2eCases,500);
 assert.equal(res.evidenceDigest,digest(v.payload));
});
test('real current 141 mapped assertions do not qualify as independent 500-case signoff',()=>{
 const v=sample();v.index.cases=v.index.cases.slice(0,141);
 assert.throws(()=>verifyReleaseCertification(v.certificate(),v.trust,v.index,commit),/500-slot/);
});
test('altered signed deployment/evidence invalidates all operator signatures',()=>{
 const v=sample(),c=v.certificate();c.payload.cases[7].artifactDigest='sha256:'+'a'.repeat(64);
 assert.throws(()=>verifyReleaseCertification(c,v.trust,v.index,commit),/signature invalid/);
});
test('signer cannot double-sign a role or impersonate independent security review',()=>{
 const v=sample(),c=v.certificate();c.signatures[2].keyId=c.signatures[1].keyId;
 assert.throws(()=>verifyReleaseCertification(c,v.trust,v.index,commit),/independent roles/);
});
test('persistent staging is mandatory; CI, fake hosts and short/future observations fail closed',()=>{
 const v=sample();
 assert.throws(()=>verifyReleaseCertification({
  ...v.certificate(),payload:{...v.payload,staging:undefined}
 },v.trust,v.index,commit),/persistent staging/);
 for(const override of [
  {httpsOrigin:'http://localhost:3000'},
  {httpsOrigin:'https://staging.example'},
  {httpsOrigin:'https://127.0.0.1'},
  {actualDeploymentObserved:false},
  {nonBypassRlsAppRoleProven:false},
  {firstIndependentCheckAt:new Date(Date.now()-2*3600000).toISOString()},
  {lastIndependentCheckAt:new Date(Date.now()+7*86400000).toISOString()}
 ]){
  assert.throws(()=>verifyPersistentStagingEvidence({
   ...v.payload.staging,...override
  },commit),/RELEASE_CERTIFICATION_BLOCKED/);
 }
});
test('acceptance must bind the authoritative 500 distinct blueprint case identifiers',()=>{
 const v=sample(),c=v.certificate();
 c.payload.canonicalCaseIndexDigest='sha256:'+'a'.repeat(64);
 assert.throws(()=>verifyReleaseCertification(c,v.trust,v.index,commit),/canonical 500-case index/);
 const spoof=sample();
 spoof.index.cases[0]={id:'T99-999'};
 assert.throws(()=>verifyReleaseCertification(spoof.certificate(),spoof.trust,
  spoof.index,commit),/canonical 500-slot/);
 const duplicate=sample();
 duplicate.index.cases[1]=duplicate.index.cases[0];
 assert.throws(()=>verifyReleaseCertification(duplicate.certificate(),duplicate.trust,
  duplicate.index,commit),/canonical 500-slot/);
});
test('undisclosed database gaps, BYPASSRLS and absent provider UAT block production',()=>{
 for(const change of [
  p=>{p.database.uncoveredTenantTables=1},
  p=>{p.database.applicationRoleBypassRls=true},
  p=>{p.providers.stagingEntitlementsVerified=false},
  p=>{p.security.independentPentestPassed=false},
  p=>{p.recovery.restoreAndPitrPassed=false},
  p=>{p.cases[0].status='NOT_RUN'}
 ]){
  const v=sample();change(v.payload);
  assert.throws(()=>verifyReleaseCertification(v.certificate(),v.trust,v.index,commit),
   /RELEASE_CERTIFICATION_BLOCKED/);
 }
});
test('untrusted keys, wrong commit and self-signed code author block release',()=>{
 const v=sample(),c=v.certificate();
 assert.throws(()=>verifyReleaseCertification(c,v.trust,v.index,'b'.repeat(40)),/exact commit/);
 assert.throws(()=>verifyReleaseCertification(c,{schema:'medsol-external-release-trust-v1',keys:[]},v.index,commit),/trust/);
 v.payload.codeAuthorId='independent-0';
 assert.throws(()=>verifyReleaseCertification(v.certificate(),v.trust,v.index,commit),/code author/);
});
