import {describe,it,expect} from 'vitest';
import type {Prisma} from '@prisma/client';
import {rehearsalInput,rehearsalScope,rehearsalDigest,handoverTuple,loadHandoverPin,type HandoverPin} from './offline-specialist-rehearsal.js';
const sourceId='MKT-SPECIALIST-source',targetId='MKT-SPECIALIST-target';
const id='specialist-run-'+'a'.repeat(64),digest='sha256:'+'b'.repeat(64);
const raw={agentId:targetId,requestKey:'fixture-handover-001',objective:'Assess synthetic scientific evidence',market:'Fixture',fixtureOnly:true,brainMode:'SPECIALIST_DECISION_V1'};
const pin:HandoverPin={approvalId:id,executionId:id+'-execution',sourceAgentId:sourceId,sourceScopeDigest:digest,sourceDecisionDigest:digest,disposition:'DRAFT_FOR_REVIEW',sourceEvidenceTransferred:false,externalEffectsAuthorized:false};
const template={registrationId:'specialist-'+'c'.repeat(64),registrationDigest:digest,templateId:'MKT-SCI-001',templateVersion:1,templateDigest:digest,templateInstalled:false,capability:'CHECK_EVIDENCE',maxInputBytes:20000};
const expiry='2026-12-01T00:00:00.000Z';
describe('bounded specialist handover',()=>{
 it('requires explicit decision mode, distinct target and exact upstream provenance',()=>{
  const input=rehearsalInput({...raw,handoverApprovalId:id});
  const scope=rehearsalScope('tenant-a','operator-a',input,template,expiry,undefined,pin);
  expect(scope.handover).toEqual(pin);
  expect(rehearsalDigest(scope)).not.toBe(rehearsalDigest(rehearsalScope('tenant-a','operator-a',rehearsalInput(raw),template,expiry)));
  expect(rehearsalDigest({...scope,handover:{...pin,sourceDecisionDigest:'sha256:'+'d'.repeat(64)}})).not.toBe(rehearsalDigest(scope));
  expect(()=>rehearsalInput({...raw,brainMode:'MISSION_PLAN_V1',handoverApprovalId:id})).toThrow();
  expect(()=>rehearsalInput({...raw,handoverApprovalId:id,sourceText:'not permitted'})).toThrow();
  expect(()=>rehearsalScope('tenant-a','operator-a',input,template,expiry)).toThrow();
  expect(()=>rehearsalScope('tenant-a','operator-a',input,template,expiry,undefined,{...pin,sourceAgentId:targetId})).toThrow();
  expect(()=>handoverTuple({...pin,executionId:'other'})).toThrow();
  expect(()=>handoverTuple({...pin,sourceEvidenceTransferred:true} as unknown as HandoverPin)).toThrow();
 });
 it('pins ordered ancestry and rejects cycles or excessive depth',async()=>{
  const ancestor='MKT-SPECIALIST-root';
  const multi={...pin,ancestorAgentIds:[ancestor,sourceId]};
  const input=rehearsalInput({...raw,handoverApprovalId:id});
  const scope=rehearsalScope('tenant-a','operator-a',input,template,expiry,undefined,multi);
  expect(scope.handover?.ancestorAgentIds).toEqual([ancestor,sourceId]);
  expect(rehearsalDigest(scope)).not.toBe(rehearsalDigest(rehearsalScope('tenant-a','operator-a',input,template,expiry,undefined,pin)));
  expect(()=>handoverTuple({...multi,ancestorAgentIds:[sourceId,sourceId]})).toThrow();
  expect(()=>handoverTuple({...multi,ancestorAgentIds:[sourceId,ancestor]})).toThrow();
  expect(()=>handoverTuple({...multi,ancestorAgentIds:[ancestor,'MKT-SPECIALIST-one','MKT-SPECIALIST-two',sourceId]})).toThrow();
  expect(()=>rehearsalScope('tenant-a','operator-a',input,template,expiry,undefined,{...multi,ancestorAgentIds:[targetId,sourceId]})).toThrow();
  const tx={approval:{findFirst:async()=>{throw Error('unexpected query');}}} as unknown as Prisma.TransactionClient;
  await expect(loadHandoverPin(tx,'tenant-a','operator-a',targetId,id,new Date(),undefined,[ancestor,'MKT-SPECIALIST-one','MKT-SPECIALIST-two'])).rejects.toThrow('excessive collaboration depth');
 });
 it('denies missing, self, and other-operator source approvals before retrieval',async()=>{
  for(const source of [null,{requestedBy:'other',objectId:sourceId},{requestedBy:'operator-a',objectId:targetId}]){
   const tx={approval:{findFirst:async()=>source}} as unknown as Prisma.TransactionClient;
   await expect(loadHandoverPin(tx,'tenant-a','operator-a',targetId,id,new Date())).rejects.toThrow();
  }
 });
});
