#!/usr/bin/env node
/**
 * R3-O: cryptographically checked, independent release acceptance gate.
 * Checks evidence supplied by real operators; NEVER generates signatures or
 * converts repository unit/integration tests into independently accepted E2E.
 * Public-key trust roots come ONLY from external deployment configuration.
 */
import {createPublicKey,verify,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const REQUIRED_ROLES=[
 'INDEPENDENT_QA','INDEPENDENT_PENTEST',
 'PLATFORM_SECURITY','DISASTER_RECOVERY','BUSINESS_OWNER'
];
const HASH=/^sha256:[a-f0-9]{64}$/;
const CANONICAL_CASE_ID=/^T(?:0[1-9]|1[0-6])-[0-9]{3}$/;
/** Requires independently signed evidence of a *persistent*, public-HTTPS,
 * tenant-isolated staging operator deployment, not localhost / ephemeral CI.
 * This is provenance validation, not a live DNS/TLS/uptime verification.
 */
export function verifyPersistentStagingEvidence(stage,commit,nowMs=Date.now()){
 if(!stage||stage.schema!=="medsol-independent-staging-evidence-v1"||
    stage.environment!=="persistent-staging"||
    stage.commit!==commit||
    stage.providerEgressDisabled!==true||
    stage.actualDeploymentObserved!==true||
    stage.separatelyOperatedOidcMfaVerified!==true||
    stage.tenantAgencyIsolationPassed!==true||
    stage.nonBypassRlsAppRoleProven!==true||
    stage.tlsChainIndependentlyVerified!==true||
    stage.backupRestoreAndRollbackObserved!==true||
    !HASH.test(stage.immutableImageDigest)||
    !HASH.test(stage.operatorProofDigest)||
    typeof stage.independentOperatorId!=="string"||
    stage.independentOperatorId.length<8)
  fail("independently observed persistent staging, tenant and operator proof required");
 let url;
 try{url=new URL(stage.httpsOrigin)}catch{fail("independent staging HTTPS origin required");}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.origin!==stage.httpsOrigin||
    url.username||url.password||url.search||url.hash||url.pathname!=="/"||
    url.port||!host.includes(".")||host.includes("..")||
    host==="localhost"||host.endsWith(".localhost")||
    host.endsWith(".local")||host.endsWith(".invalid")||
    host.endsWith(".example")||host.endsWith(".test")||
    host.endsWith(".internal")||host.endsWith(".arpa")||
    /^\d+(?:\.\d+){3}$/.test(host)||host.includes(":"))
  fail("public HTTPS staging origin without local, fake or IP destination required");
 const first=Date.parse(stage.firstIndependentCheckAt??"");
 const last=Date.parse(stage.lastIndependentCheckAt??"");
 if(!Number.isFinite(first)||!Number.isFinite(last)||
    first>last-24*3600000||last>nowMs+5*60000||
    last<nowMs-7*86400000)
  fail("fresh independent staging observations at least 24 hours apart required");
 return{stagingOrigin:stage.httpsOrigin,continuousUptimeNotIndependentlyProven:true,
  externalDeploymentEvidenceRequired:true};
}
function fail(message){throw new Error('RELEASE_CERTIFICATION_BLOCKED: '+message)}
const stable=value=>JSON.stringify(value,(key,item)=>{
 if(!item||typeof item!=='object'||Array.isArray(item))return item;
 return Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)));
});
export const digest=value=>'sha256:'+createHash('sha256').update(stable(value)).digest('hex');
export function verifyReleaseCertification(certificate,trust,caseIndex,expectedCommit){
 if(!certificate||certificate.schema!=='medsol-release-certification-v1')
  fail('unsupported certificate schema');
 if(!trust||trust.schema!=='medsol-external-release-trust-v1'||
    !Array.isArray(trust.keys)||trust.keys.length<REQUIRED_ROLES.length)
  fail('externally provisioned independent public-key trust required');
 if(!Array.isArray(caseIndex?.cases)||caseIndex.cases.length!==500||
    caseIndex.releaseVerdict!=='NOT_CERTIFIED'||
    caseIndex.schema!=="medsol-r3y-real-stack-500-case-acceptance-index-v1"||
    caseIndex.plannedE2eCases!==500||
    new Set(caseIndex.cases.map(c=>c.id)).size!==500||
    caseIndex.cases.some(c=>!CANONICAL_CASE_ID.test(c.id)))
  fail('actual canonical 500-slot blueprint acceptance index required');
 const p=certificate.payload;
 if(!p||p.releaseClass!=='PRODUCTION'||p.repository!=='Ashour158/medsol-ai-marketing-os'||
  p.commit!==expectedCommit||!(/^[a-f0-9]{40}$/).test(expectedCommit)||
  !p.environment||p.environment!=='production'||!p.deploymentId||
  p.externalEffectsAuthorized!==true)
  fail('production environment, exact commit and explicit external-effects approval required');
 if(p.canonicalCaseIndexDigest!==digest(caseIndex.cases.map(c=>c.id)))
  fail("signed acceptance must bind exact canonical 500-case index");
 verifyPersistentStagingEvidence(p.staging,expectedCommit);
 if(!Array.isArray(p.cases)||p.cases.length!==500||new Set(p.cases.map(c=>c.id)).size!==500)
  fail('all 500 distinct operator-executed E2E cases required');
 const ids=new Set(caseIndex.cases.map(c=>c.id));
 for(const c of p.cases){
  if(!ids.has(c.id)||c.status!=='PASS'||c.evidenceClass!=='INDEPENDENT_E2E'||
    !HASH.test(c.artifactDigest)||typeof c.operatorId!=='string'||
    c.operatorId.length<8||typeof c.runId!=='string'||c.runId.length<8||
    !Number.isFinite(Date.parse(c.executedAt||''))||
    typeof c.triageReference!=='string'||c.triageReference.length<8)
   fail('missing/forged/incomplete independent E2E result '+String(c?.id));
 }
 if(!p.database?.allTenantOwnedTablesForceRls||
    p.database?.uncoveredTenantTables!==0||
    p.database?.applicationRoleBypassRls!==false||
    p.database?.sessionContextIsolationPassed!==true||
    !HASH.test(p.database?.censusArtifactDigest)||
    p.database?.environment!=='production')
  fail('production database isolation not independently proven');
 if(!p.security?.independentPentestPassed||
    p.security?.unresolvedCritical!==0||p.security?.unresolvedHigh!==0||
    !HASH.test(p.security?.pentestReportDigest)||
    !p.security?.secretsAndKeyRotationValidated||
    !p.security?.supplyChainAndSastValidated)
  fail('independent production penetration test and security proofs required');
 if(!p.recovery?.restoreAndPitrPassed||
    !p.recovery?.actualRtoRpoWithinApprovedLimits||
    !HASH.test(p.recovery?.recoveryEvidenceDigest)||
    !p.recovery?.independentObserverId)
  fail('production PITR/RTO/RPO and independent DR observation required');
 if(!p.providers?.stagingEntitlementsVerified||
    !p.providers?.officialAdapterReconciliationPassed||
    !p.providers?.zeroUnauthorizedExternalEffects||
    !HASH.test(p.providers?.uatArtifactDigest))
  fail('real eligible-provider staging UAT must be approved and independently reconciled');
 if(!p.operability?.oncallReceiverVerified||
    !p.operability?.rollbackRehearsalPassed||
    !p.operability?.killSwitchRehearsalPassed||
    !p.operability?.consentAndPrivacyReviewPassed)
  fail('production operating, privacy and rollback gates required');

 const signatures=certificate.signatures;
 if(!Array.isArray(signatures)||signatures.length<REQUIRED_ROLES.length)
  fail('five independent operator signatures required');
 const byKey=new Map(),byRole=new Map(),byPerson=new Map();
 for(const t of trust.keys){
  if(!t||typeof t.keyId!=='string'||!t.publicKeyPem||
     typeof t.role!=='string'||typeof t.personId!=='string')
   fail('invalid external trust entry');
  if(byKey.has(t.keyId))fail('duplicate trusted public key');
  byKey.set(t.keyId,t);
 }
 const bytes=Buffer.from(stable(p),'utf8');
 for(const s of signatures){
  if(!s||typeof s.keyId!=='string'||typeof s.sig!=='string'||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(s.sig)||
    s.algorithm!=='Ed25519')
   fail('unsupported or malformed certificate signature');
  const key=byKey.get(s.keyId);
  if(!key||!REQUIRED_ROLES.includes(key.role)||byRole.has(key.role)||
    byPerson.has(key.personId))fail('independent roles/persons or trusted key invalid');
  let valid=false;
  try{
   const publicKey=createPublicKey(key.publicKeyPem);
   valid=publicKey.asymmetricKeyType==='ed25519'&&
    verify(null,bytes,publicKey,Buffer.from(s.sig,'base64'));
  }catch{}
  if(!valid)fail('cryptographic attestation signature invalid');
  byRole.set(key.role,key.personId);byPerson.set(key.personId,key.role);
 }
 for(const role of REQUIRED_ROLES)if(!byRole.has(role))
  fail('independent '+role+' signature missing');
 if(new Set(p.cases.map(c=>c.operatorId)).size<2)
  fail('independent E2E testing requires more than one operator');
 if(p.codeAuthorId&&byPerson.has(p.codeAuthorId))
  fail('code author cannot serve as independent production signatory');
 return{
  schema:'medsol-release-certification-verdict-v1',
  verdict:'PRODUCTION_EVIDENCE_CRYPTOGRAPHICALLY_ACCEPTED',
  commit:expectedCommit,
  signedOperatorRoles:REQUIRED_ROLES,
  independentlyExecutedE2eCases:500,
  canonicalCaseIndexDigest:p.canonicalCaseIndexDigest,
  verifiedPersistentStagingAttestation:true,
  stagingUptimeNotCryptographicallyProven:true,
  evidenceDigest:digest(p),
  // This is evidence validation, not a declaration that the service is
  // currently deployed or that future configuration stays secure.
  provenance:'externally_supplied_operator_attestations'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==6||
    process.argv[2]!=='--certificate'||
    process.argv[4]!=='--case-index')fail('usage: --certificate FILE --case-index FILE');
 const trustRaw=process.env.MARKETING_RELEASE_TRUST_KEYS_JSON;
 const expectedCommit=process.env.MARKETING_RELEASE_COMMIT_SHA;
 if(!trustRaw||!expectedCommit)
  fail('external trust keys and expected immutable deployment commit required');
 const cert=JSON.parse(readFileSync(process.argv[3],'utf8'));
 const index=JSON.parse(readFileSync(process.argv[5],'utf8'));
 process.stdout.write(JSON.stringify(
  verifyReleaseCertification(cert,JSON.parse(trustRaw),index,expectedCommit),null,2)+'\n');
}
