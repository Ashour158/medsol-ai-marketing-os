import {describe,it,expect} from 'vitest';
import {specialistDecision,SPECIALIST_DECISION_MODE} from './specialist-decision-brain.js';
import {specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
import {rehearsalInput} from './offline-specialist-rehearsal.js';
import {assertSkillMode} from './specialist-skill-evaluation.js';
const fixture={mission:'Review synthetic scientific evidence',objective:'Review scientific evidence',market:'Fixture',capability:'CHECK_EVIDENCE',references:['kb:synthetic:0:123']};
describe('specialist decision engine',()=>{
 it('selects exactly one bounded disposition based on mission, evidence and canonical policy',()=>{
  const plan=specialistMissionPlan(fixture);
  const draft=specialistDecision(plan,true);
  expect(draft).toMatchObject({mode:SPECIALIST_DECISION_MODE,disposition:'DRAFT_FOR_REVIEW',draftEligible:true,humanReviewRequired:true,semanticAlignmentVerified:false,scientificVerification:false,externalEffectsAuthorized:false,modelCallsAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false,autonomousExecutionAuthorized:false});
  expect(draft.candidates.filter(c=>c.eligible)).toHaveLength(1);
  expect(specialistDecision(plan,false)).toMatchObject({disposition:'TEMPLATE_BLOCKED',draftEligible:false});
  expect(specialistDecision(specialistMissionPlan({...fixture,objective:'Compose unrelated advertisements'}),true)).toMatchObject({disposition:'ESCALATE_SCOPE',draftEligible:false});
  expect(specialistDecision(specialistMissionPlan({...fixture,references:[]}),true)).toMatchObject({disposition:'REQUEST_EVIDENCE',draftEligible:false});
  expect(specialistPlanDigest(draft)).not.toBe(specialistPlanDigest(specialistDecision(plan,false)));
  expect(()=>specialistDecision({...plan,externalEffectsAuthorized:true},true)).toThrow();
 });
 it('accepts only explicit versioned mode and retains existing competency gate',()=>{
  const raw={agentId:'MKT-SPECIALIST-science',requestKey:'fixture-decision-001',objective:fixture.objective,market:fixture.market,fixtureOnly:true,brainMode:SPECIALIST_DECISION_MODE};
  expect(rehearsalInput(raw).brainMode).toBe(SPECIALIST_DECISION_MODE);
  expect(()=>rehearsalInput({...raw,brainMode:'AUTONOMOUS'})).toThrow();
  expect(()=>assertSkillMode(['EVIDENCE_GAPS'],SPECIALIST_DECISION_MODE)).not.toThrow();
  expect(()=>assertSkillMode(['EVIDENCE_GAPS'],undefined)).toThrow();
 });
});
