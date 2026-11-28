import {describe,it,expect} from 'vitest';
import type {Prisma} from '@prisma/client';
import {loadLearningEvidence,recommendReviewSkill,assertLearningSelection,learningEvidenceTuple} from './specialist-learning-evidence.js';
import {configInput,configScope,configDigest} from './offline-specialist-config.js';
const org='tenant-a',agent='MKT-SPECIALIST-evidence',id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',now=new Date('2026-12-01T12:00:00Z');
const row={actorId:'operator-a',occurredAt:new Date('2026-11-30T12:00:00Z'),after:{specialistAgentId:agent,evaluationSource:'OPERATOR_LABELED_INTERNAL_CORPUS',independentlyVerified:false,claimVerification:false,promotionAuthorized:false,modelOrSkillPromotionAuthorized:false,providerRequestsMade:0,cases:1,cutoff:1,hits:1,recallAtK:1,precisionAtK:1,observations:[{}]}};
function mock(rows:unknown[]){return {auditEvent:{findMany:async()=>rows}} as unknown as Prisma.TransactionClient;}
describe('specialist evidence-linked competency proposals',()=>{
 it('uses stored tenant diagnostic metrics rather than user-submitted scores',async()=>{
  const p=await loadLearningEvidence(mock([row]),org,agent,id,now);
  expect(p).toMatchObject({evaluationId:id,recallAtK:1,precisionAtK:1,recommendedSkill:'CLAIM_LIMITATIONS',independentlyVerified:false,automaticPromotion:false});
  expect(recommendReviewSkill(0.5,1)).toBe('EVIDENCE_GAPS');
  expect(recommendReviewSkill(1,0.5)).toBe('EVIDENCE_GAPS');
  expect(()=>assertLearningSelection(p,['EVIDENCE_GAPS'])).toThrow();
  expect(()=>assertLearningSelection(p,['CLAIM_LIMITATIONS'])).not.toThrow();
  expect(()=>learningEvidenceTuple({...p,automaticPromotion:true} as unknown as typeof p)).toThrow();
 });
 it('rejects absent, duplicate, stale, future, foreign-agent and forged records',async()=>{
  for(const rows of [[],[row,row],[{...row,occurredAt:new Date('2026-11-20')}],[{...row,occurredAt:new Date('2026-12-02')}],[{...row,after:{...row.after,specialistAgentId:'MKT-SPECIALIST-other'}}],[{...row,after:{...row.after,promotionAuthorized:true}}],[{...row,after:{...row.after,recallAtK:1.1}}]])
   await expect(loadLearningEvidence(mock(rows),org,agent,id,now)).rejects.toThrow();
 });
 it('binds the diagnostic snapshot while preserving manual configuration digests',async()=>{
  const p=await loadLearningEvidence(mock([row]),org,agent,id,now);
  const raw={action:'CONFIGURE',agentId:agent,requestKey:'fixture-learning-001',mission:'Review synthetic scientific evidence',evidenceRequired:true,expectedVersion:0,maxObjectiveChars:100,fixtureOnly:true,reviewSkills:['CLAIM_LIMITATIONS']};
  const reg='specialist-'+'a'.repeat(64),digest='sha256:'+'b'.repeat(64),expiry='2026-12-02T12:00:00Z';
  const manual=configScope(org,'operator-a',configInput(raw),reg,digest,null,expiry);
  const input=configInput({...raw,learningEvaluationId:id});
  const linked=configScope(org,'operator-a',input,reg,digest,null,expiry,p);
  expect(configDigest(linked)).not.toBe(configDigest(manual));
  expect(configDigest({...linked,learningEvidence:{...p,diagnosticDigest:'sha256:'+'c'.repeat(64)}})).not.toBe(configDigest(linked));
  expect(()=>configScope(org,'operator-a',input,reg,digest,null,expiry)).toThrow();
  expect(()=>configInput({...raw,learningEvaluationId:id,recallAtK:1})).toThrow();
 });
});
