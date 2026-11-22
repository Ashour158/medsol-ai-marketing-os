import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOperatorPackets,canonicalIds} from './independent-qa-packets.mjs';
const index=()=>({
 schema:'medsol-r3y-real-stack-500-case-acceptance-index-v1',
 releaseVerdict:'NOT_CERTIFIED',plannedE2eCases:500,
 cases:canonicalIds.map(id=>({
  id,suite:id.slice(0,3),area:'Operator scope',
  target500E2eCaseStatus:'UNEXECUTED',independentlySignedOff:false,
  engineeringEvidence:{testSource:'offline-reference.test.ts'}
 }))
});
test('T7A emits ten distinct, unsigned, 50-case operator packets',()=>{
 const p=buildOperatorPackets(index());
 assert.equal(p.packetCount,10);
 assert.equal(p.totalCases,500);
 assert.equal(p.independentlyExecutedCases,0);
 assert.equal(p.stagingVerified,false);
 const all=p.packets.flatMap(b=>b.cases);
 assert.deepEqual(all.map(c=>c.id),canonicalIds);
 assert.equal(new Set(all.map(c=>c.id)).size,500);
 for(const c of all){
  assert.equal(c.independentExecutionStatus,'NOT_RUN');
  assert.equal(c.independentReviewerSignature,null);
  assert.equal(c.independentOperatorId,null);
  assert.equal(c.artifactDigest,null);
 }
});
test('T7A refuses synthetic pass flags, spoofed cases and swapped order',()=>{
 const variants=[
  x=>{x.cases[0].id='T99-999';},
  x=>{x.cases[1].id=x.cases[0].id;},
  x=>{[x.cases[0],x.cases[1]]=[x.cases[1],x.cases[0]];},
  x=>{x.cases[0].independentlySignedOff=true;},
  x=>{x.cases[0].target500E2eCaseStatus='PASS';},
  x=>{x.cases.pop();},
  x=>{x.releaseVerdict='CERTIFIED';}
 ];
 for(const mutate of variants){
  const x=index();mutate(x);
  assert.throws(()=>buildOperatorPackets(x),/INDEPENDENT_QA_PACKET_BLOCKED/);
 }
});
test('T7A enforces bounded batch size and never assumes staging',()=>{
 for(const size of [0,101,1.5,NaN])
  assert.throws(()=>buildOperatorPackets(index(),{batchSize:size}),
   /INDEPENDENT_QA_PACKET_BLOCKED/);
 const p=buildOperatorPackets(index(),{batchSize:75});
 assert.equal(p.packetCount,7);
 assert.equal(p.packets.at(-1).caseCount,50);
 assert.equal(p.packets.at(-1).independentSignatures,0);
});
