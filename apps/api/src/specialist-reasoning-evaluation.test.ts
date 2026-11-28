import {describe,it,expect} from 'vitest';
import {evaluateSpecialistReasoning,REASONING_EVALUATION_MODE} from './specialist-reasoning-evaluation.js';
import {specialistMissionPlan} from './specialist-mission-brain.js';
import {specialistDecision} from './specialist-decision-brain.js';
import {rehearsalInput,rehearsalScope,rehearsalDigest} from './offline-specialist-rehearsal.js';
import type {SpecialistContextPin} from './specialist-context-pin.js';
const digest='sha256:'+'a'.repeat(64);
const pin:SpecialistContextPin={query:'scientific evidence',references:[{kind:'SOURCE',documentId:'document-fixture',recordId:'chunk-fixture',citationRef:'kb:document-fixture:0:aaaaaaaaaaaa',digest,sourceDigest:digest},{kind:'MEMORY',documentId:'document-fixture',recordId:'memory-fixture',citationRef:'km:memory-fixture:aaaaaaaaaaaa',digest,sourceDigest:digest}]};
const fixture={mission:'Review scientific evidence',objective:'Review scientific evidence',market:'Fixture',capability:'CHECK_EVIDENCE',references:pin.references.map(r=>r.citationRef)};
describe('counterfactual specialist reasoning evaluation',()=>{
 it('executes all eight decision combinations and reports actual evidence structure only',()=>{
  const plan=specialistMissionPlan(fixture),decision=specialistDecision(plan,true);
  const result=evaluateSpecialistReasoning(plan,decision,pin);
  expect(result).toMatchObject({mode:REASONING_EVALUATION_MODE,passedCases:8,totalCases:8,evidenceDiagnostics:{sourceReferences:1,memoryReferences:1,distinctDocuments:1,independentlyVerified:false},modelQualityEvaluated:false,scientificVerification:false,semanticAlignmentVerified:false,automaticLearning:false,externalEffectsAuthorized:false});
  expect(result.results.every(r=>r.passed&&r.expected===r.observed)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('document-fixture');
  expect(()=>evaluateSpecialistReasoning(plan,decision)).toThrow('reference integrity');
  expect(()=>evaluateSpecialistReasoning(plan,{...decision,draftEligible:false},pin)).toThrow('evaluation integrity');
 });
 it('evaluates blocked and evidence-free decisions without granting authority',()=>{
  const plan=specialistMissionPlan({...fixture,references:[]}),decision=specialistDecision(plan,true);
  expect(decision.draftEligible).toBe(false);
  expect(evaluateSpecialistReasoning(plan,decision)).toMatchObject({passedCases:8,evidenceDiagnostics:{sourceReferences:0,memoryReferences:0,distinctDocuments:0},externalEffectsAuthorized:false});
 });
 it('pins explicit evaluation mode and rejects arbitrary modes',()=>{
  const raw={agentId:'MKT-SPECIALIST-fixture',requestKey:'fixture-evaluation-001',objective:fixture.objective,market:fixture.market,fixtureOnly:true,brainMode:'SPECIALIST_DECISION_V1'};
  const template={registrationId:'specialist-registration',registrationDigest:digest,templateId:'MKT-SCI-001',templateVersion:1,templateDigest:digest,templateInstalled:false,capability:'CHECK_EVIDENCE',maxInputBytes:65536};
  const expiry='2026-12-01T00:00:00.000Z';
  expect(rehearsalDigest(rehearsalScope('tenant-fixture','operator',rehearsalInput({...raw,evaluationMode:REASONING_EVALUATION_MODE}),template,expiry))).not.toBe(rehearsalDigest(rehearsalScope('tenant-fixture','operator',rehearsalInput(raw),template,expiry)));
  expect(()=>rehearsalInput({...raw,evaluationMode:'LIVE'})).toThrow();
  expect(()=>rehearsalInput({...raw,brainMode:'MISSION_PLAN_V1',evaluationMode:REASONING_EVALUATION_MODE})).toThrow();
 });
});
