#!/usr/bin/env node
/** Converts the one authoritative 500-case index into ten UNSIGNED human
 * operator work packets. Never fabricates results, signatures or CI execution.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest} from './production-release-certification.mjs';

const allocation=[35,30,30,35,35,30,30,40,40,45,25,25,30,20,30,20];
export const canonicalIds=allocation.flatMap((count,i)=>
 Array.from({length:count},(_,n)=>
  'T'+String(i+1).padStart(2,'0')+'-'+String(n+1).padStart(3,'0')));
const fail=message=>{throw Error('INDEPENDENT_QA_PACKET_BLOCKED: '+message);};
export function buildOperatorPackets(index,{batchSize=50}={}){
 if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>100)
  fail('bounded operator batch size 1–100 required');
 if(!index||index.schema!=='medsol-r3y-real-stack-500-case-acceptance-index-v1'||
    index.releaseVerdict!=='NOT_CERTIFIED'||index.plannedE2eCases!==500||
    !Array.isArray(index.cases)||index.cases.length!==500||
    index.cases.some((c,i)=>c?.id!==canonicalIds[i]||
     c.target500E2eCaseStatus!=='UNEXECUTED'||
     c.independentlySignedOff!==false))
  fail('original ordered canonical 500-case UNEXECUTED index required');
 const indexDigest=digest(canonicalIds);
 const packets=[];
 for(let i=0;i<500;i+=batchSize){
  const cases=index.cases.slice(i,i+batchSize).map(c=>({
   id:c.id,suite:c.suite,area:c.area,
   engineeringEvidenceReference:c.engineeringEvidence?.testSource??null,
   independentExecutionStatus:'NOT_RUN',
   independentOperatorId:null,stagingOrigin:null,observedAt:null,
   runId:null,artifactDigest:null,defectReference:null,
   expectedBehavior:null,observedBehavior:null,
   tenantOrAgencyScope:null,independentReviewerId:null,
   independentReviewerSignature:null,
   note:'CI evidence is not human execution; record real operator results externally'
  }));
  packets.push({
   schema:'medsol-independent-qa-work-packet-v1',
   releaseVerdict:'NOT_CERTIFIED',packetNumber:packets.length+1,
   canonicalCaseIndexDigest:indexDigest,caseCount:cases.length,
   independentExecutedCases:0,independentSignatures:0,
   deploymentStatus:'UNVERIFIED',providerAccountsConnected:false,
   cases
  });
 }
 return{schema:'medsol-independent-qa-packet-manifest-v1',
  releaseVerdict:'NOT_CERTIFIED',canonicalCaseIndexDigest:indexDigest,
  totalCases:500,packetCount:packets.length,
  independentlyExecutedCases:0,independentSignatures:0,
  stagingVerified:false,packets};
}
function main(){
 const args=process.argv.slice(2);
 if(args.length!==4||args[0]!=='--index'||args[2]!=='--output-dir')
  fail('Usage: node scripts/quality/independent-qa-packets.mjs --index <canonical.json> --output-dir <private-dir>');
 const index=JSON.parse(readFileSync(resolve(args[1]),'utf8'));
 const manifest=buildOperatorPackets(index);
 const dir=resolve(args[3]);mkdirSync(dir,{recursive:true,mode:0o700});
 for(const p of manifest.packets){
  const name='independent-qa-batch-'+String(p.packetNumber).padStart(2,'0')+'.json';
  writeFileSync(join(dir,name),JSON.stringify(p,null,2)+'\n',{mode:0o600,flag:'wx'});
 }
 const summary={...manifest,packets:manifest.packets.map(p=>({
  packetNumber:p.packetNumber,caseCount:p.caseCount,
  firstCase:p.cases[0].id,lastCase:p.cases.at(-1).id
 }))};
 writeFileSync(join(dir,'manifest.json'),JSON.stringify(summary,null,2)+'\n',
  {mode:0o600,flag:'wx'});
 process.stdout.write(JSON.stringify(summary,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main();
