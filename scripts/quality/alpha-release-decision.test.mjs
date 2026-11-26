import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {digest} from './production-release-certification.mjs';
import {verifyAlphaDecision as check} from './alpha-release-decision.mjs';
const now=Date.now(),commit='a'.repeat(40),hash='sha256:'+'b'.repeat(64),date=new Date(now).toISOString();
function fixture(){
 const p={repository:'Ashour158/medsol-ai-marketing-os',commit,releaseClass:'INTERNAL_ALPHA',externalEffectsAuthorized:false,
  productionCertified:false,codeAuthorId:'fixture-implementer',independentReviewerId:'fixture-reviewer',ownerDecision:'GO',
  runbookDigest:hash,limitationsDigest:hash,deployment:{id:'fixture-host',environment:'persistent-staging',
   actualDeploymentObserved:true,apiImageDigest:hash,webImageDigest:hash,lockfileDigest:hash,environmentEvidenceDigest:hash,
   noLiveProviders:true,egressDefaultDeny:true,restrictedPostgresVerified:true,restoreAndRollbackObserved:true,
   unresolvedCritical:0,unresolvedHigh:0,httpsOrigin:'https://fixture-alpha.medsol.invalid',observedAt:date},
  gates:Array.from({length:12},(_,i)=>({id:'AL'+String(i+1).padStart(2,'0'),status:'PASS',evidenceClass:'INDEPENDENT_DEPLOYED_ALPHA',
   deploymentId:'fixture-host',commit,evidenceDigest:hash,operatorId:'fixture-reviewer',executedAt:date}))};
 // Test-only example with syntactically acceptable URL; no network or real signature.
 p.deployment.httpsOrigin='https://alpha-fixture.medsol.org';
 const keys=['INDEPENDENT_QA','BUSINESS_OWNER'].map((role,i)=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  return {keyId:'test-'+i,role,personId:i?'fixture-owner':'fixture-reviewer',publicKeyPem:publicKey.export({type:'spki',format:'pem'}),privateKey};
 });
 const trust={schema:'medsol-external-release-trust-v1',keys:keys.map(({privateKey,...k})=>k)};
 const seal=()=>({schema:'medsol-alpha-acceptance-v1',payload:p,signatures:keys.map(k=>({keyId:k.keyId,algorithm:'Ed25519',sig:sign(null,Buffer.from(digest(p)),k.privateKey).toString('base64')}))});
 return {p,trust,seal};
}
test('synthetic valid signed packet cannot certify production or create a tag',()=>{
 const {trust,seal}=fixture(),r=check(seal(),trust,commit,now);
 assert.equal(r.verdict,'INTERNAL_ALPHA_GO_ATTESTATIONS_VERIFIED');assert.equal(r.productionCertified,false);
 assert.equal(r.releaseTagCreated,false);assert.equal(r.independentObservationContentVerifiedByTool,false);
});
test('missing gates, disposable CI, unsafe security, wrong commit and fabricated evidence fail',()=>{
 for(const alter of [p=>p.gates.pop(),p=>p.gates[0].status='NOT_RUN',p=>p.gates[0].evidenceClass='CI',
  p=>p.deployment.environment='disposable-ci',p=>p.deployment.unresolvedHigh=1,p=>p.deployment.restoreAndRollbackObserved=false,
  p=>p.deployment.httpsOrigin='https://localhost',p=>p.commit='c'.repeat(40),p=>p.externalEffectsAuthorized=true]){
  const {p,trust,seal}=fixture();alter(p);assert.throws(()=>check(seal(),trust,commit,now),/ALPHA_NO_GO/);
 }
});
test('no trust, self-certification, reused roles, modified payload and missing signature fail',()=>{
 const f=fixture(),cert=f.seal();assert.throws(()=>check(cert,null,commit,now));
 assert.throws(()=>check({...cert,signatures:cert.signatures.slice(0,1)},f.trust,commit,now));
 const wrong={...f.trust,keys:f.trust.keys.map(k=>({...k,personId:'fixture-implementer'}))};
 assert.throws(()=>check(cert,wrong,commit,now));
 cert.payload.runbookDigest='sha256:'+'c'.repeat(64);assert.throws(()=>check(cert,f.trust,commit,now));
});
