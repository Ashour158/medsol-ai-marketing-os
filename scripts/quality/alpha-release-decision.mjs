#!/usr/bin/env node
/** Alpha-only attestation verifier. No generated signatures, deployment, or release tag.
 * Production certification remains exclusively production-release-certification.mjs.
 * Externally configured public-key trust is mandatory; signatures attest supplied
 * observations, not automatically observed infrastructure or human identity.
 */
import {createPublicKey,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {digest} from './production-release-certification.mjs';
const hash=/^sha256:[a-f0-9]{64}$/;
const ids=Array.from({length:12},(_,i)=>'AL'+String(i+1).padStart(2,'0'));
const block=message=>{throw Error('ALPHA_NO_GO: '+message)};
const person=x=>typeof x==='string'&&x.trim().length>=8;
export function verifyAlphaDecision(certificate,trust,commit,now=Date.now()){
 const p=certificate?.payload;
 if(certificate?.schema!=='medsol-alpha-acceptance-v1'||p?.repository!=='Ashour158/medsol-ai-marketing-os'||
    !/^[a-f0-9]{40}$/.test(commit??'')||p.commit!==commit||p.releaseClass!=='INTERNAL_ALPHA'||
    p.externalEffectsAuthorized!==false||p.productionCertified!==false)
  block('exact internal offline Alpha commit required');
 const d=p.deployment;
 if(!person(d?.id)||d.environment!=='persistent-staging'||d.actualDeploymentObserved!==true||
    !hash.test(d.apiImageDigest)||!hash.test(d.webImageDigest)||!hash.test(d.lockfileDigest)||
    !hash.test(d.environmentEvidenceDigest)||d.noLiveProviders!==true||d.egressDefaultDeny!==true||
    d.restrictedPostgresVerified!==true||d.restoreAndRollbackObserved!==true||
    d.unresolvedCritical!==0||d.unresolvedHigh!==0)
  block('persistent deployment, image/lock lineage, security and recovery observations required');
 let url;try{url=new URL(d.httpsOrigin)}catch{block('HTTPS staging origin required')}
 if(url.protocol!=='https:'||url.origin!==d.httpsOrigin||url.username||url.password||
    /^(localhost|127\.|0\.|\[::)/i.test(url.hostname)||/\.(invalid|example|test|localhost)$/i.test(url.hostname))
  block('real staging HTTPS origin required');
 const observed=Date.parse(d.observedAt??'');
 if(!Number.isFinite(observed)||observed>now+300000||observed<now-7*86400000)
  block('fresh independent deployment observation required');
 if(!person(p.codeAuthorId)||!person(p.independentReviewerId)||p.codeAuthorId===p.independentReviewerId)
  block('independent reviewer must differ from implementer');
 if(!Array.isArray(p.gates)||p.gates.length!==ids.length||new Set(p.gates.map(g=>g.id)).size!==ids.length)
  block('all twelve scoped Alpha gates required');
 for(const g of p.gates){
  const time=Date.parse(g.executedAt??'');
  if(!ids.includes(g.id)||g.status!=='PASS'||g.evidenceClass!=='INDEPENDENT_DEPLOYED_ALPHA'||
    g.deploymentId!==d.id||g.commit!==commit||!hash.test(g.evidenceDigest)||
    g.operatorId!==p.independentReviewerId||!Number.isFinite(time)||time>now+300000||time<now-7*86400000)
   block('missing independent deployed evidence for '+String(g.id));
 }
 if(p.ownerDecision!=='GO'||!hash.test(p.runbookDigest)||!hash.test(p.limitationsDigest))
  block('owner GO and reviewed runbook/limitations required');
 if(trust?.schema!=='medsol-external-release-trust-v1'||!Array.isArray(trust.keys)||
    !Array.isArray(certificate.signatures)||certificate.signatures.length!==2)
  block('external trust and two independent signatures required');
 const roles=new Map(),persons=new Set(),keys=new Set(),signingKeys=new Set();
 for(const key of trust.keys){
  if(!key||typeof key.keyId!=='string'||keys.has(key.keyId))block('invalid duplicate trust key');
  keys.add(key.keyId);
 }
 // Ed25519 signs the canonical SHA256 digest string of the complete payload,
 // using the existing production certification digest helper.
 const bytes=Buffer.from(digest(p),'utf8');
 for(const s of certificate.signatures){
  const k=trust.keys.find(x=>x.keyId===s?.keyId);
  if(!k||!['INDEPENDENT_QA','BUSINESS_OWNER'].includes(k.role)||roles.has(k.role)||
     !person(k.personId)||k.personId===p.codeAuthorId||persons.has(k.personId)||
     s.algorithm!=='Ed25519'||typeof s.sig!=='string')block('independent roles and keys required');
  let valid=false;try{const pk=createPublicKey(k.publicKeyPem);
   const fingerprint=digest(pk.export({type:'spki',format:'der'}).toString('base64'));
   if(!signingKeys.has(fingerprint)&&pk.asymmetricKeyType==='ed25519'&&verify(null,bytes,pk,Buffer.from(s.sig,'base64'))){valid=true;signingKeys.add(fingerprint);}}catch{}
  if(!valid)block('invalid Alpha attestation signature');
  roles.set(k.role,k.personId);persons.add(k.personId);
 }
 if(roles.get('INDEPENDENT_QA')!==p.independentReviewerId||!roles.has('BUSINESS_OWNER'))
  block('independent reviewer and business owner attestation required');
 return {verdict:'INTERNAL_ALPHA_GO_ATTESTATIONS_VERIFIED',commit,deploymentId:d.id,
  externalEffectsAuthorized:false,productionCertified:false,releaseTagCreated:false,
  independentObservationContentVerifiedByTool:false,acceptanceDigest:digest(p)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [certificatePath,trustPath,commit]=process.argv.slice(2);
 try{if(!certificatePath||!trustPath||!commit)block('certificate, external trust, expected commit required');
  console.log(JSON.stringify(verifyAlphaDecision(JSON.parse(readFileSync(certificatePath,'utf8')),
   JSON.parse(readFileSync(trustPath,'utf8')),commit),null,2));
 }catch(e){console.error(e.message);process.exitCode=1}
}
