import {describe,it,expect} from 'vitest';
import {evaluateSpecialistReviewSkills,assertSkillMode} from './specialist-skill-evaluation.js';
import {specialistMissionPlan,normalizeReviewSkills} from './specialist-mission-brain.js';
import {configInput,configScope,configDigest,configPinTuple} from './offline-specialist-config.js';
const raw={action:'CONFIGURE',agentId:'MKT-SPECIALIST-evidence',requestKey:'fixture-config-001',mission:'Review synthetic scientific evidence',evidenceRequired:true,expectedVersion:0,maxObjectiveChars:100,fixtureOnly:true};
const fixture={mission:raw.mission,objective:'Review synthetic evidence',market:'Fixture',capability:'CHECK_EVIDENCE',references:['kb:synthetic:0:123']};
describe('reviewed specialist planning competencies',()=>{
 it('runs the fixed safety corpus, canonicalizes selection and never grants authority',()=>{
  const result=evaluateSpecialistReviewSkills(['EVIDENCE_GAPS','CLAIM_LIMITATIONS']);
  expect(result).toMatchObject({skills:['CLAIM_LIMITATIONS','EVIDENCE_GAPS'],passed:true,modelQualityEvaluated:false,scientificVerification:false,capabilityExpansionAuthorized:false});
  expect(result.results).toEqual([{id:'NO_EVIDENCE',passed:true},{id:'PINNED_REFERENCE',passed:true},{id:'DUPLICATE_REFERENCE_DENIAL',passed:true}]);
  expect(specialistMissionPlan({...fixture,reviewSkills:result.skills}).tasks.map(t=>t.kind)).toEqual(['SCOPE_REVIEW','EVIDENCE_REVIEW','DRAFT_REVIEW','CLAIM_LIMITATIONS','EVIDENCE_GAPS']);
  expect(specialistMissionPlan(fixture)).not.toHaveProperty('reviewSkills');
  expect(()=>normalizeReviewSkills(['SEND_EMAIL'])).toThrow();
  expect(()=>normalizeReviewSkills(['EVIDENCE_GAPS','EVIDENCE_GAPS'])).toThrow();
  expect(()=>assertSkillMode(result.skills,undefined)).toThrow();
  expect(()=>assertSkillMode(result.skills,'MISSION_PLAN_V1')).not.toThrow();
  expect(()=>assertSkillMode([],undefined)).not.toThrow();
 });
 it('binds selected skills and executed safety results to the approved configuration',()=>{
  const args=['tenant-a','actor-a'] as const;
  const reg='specialist-'+'a'.repeat(64),digest='sha256:'+'b'.repeat(64),expiry='2026-12-01T00:00:00.000Z';
  const legacy=configScope(...args,configInput(raw),reg,digest,null,expiry);
  const scoped=configScope(...args,configInput({...raw,reviewSkills:['EVIDENCE_GAPS']}),reg,digest,null,expiry);
  expect(legacy).not.toHaveProperty('skillEvaluation');
  expect(configDigest(scoped)).not.toBe(configDigest(legacy));
  expect(configDigest(scoped)).not.toBe(configDigest({...scoped,skillEvaluation:{...scoped.skillEvaluation!,results:[]}}));
  const pin={approvalId:'specialist-config-'+'a'.repeat(64),digest,version:1,mission:raw.mission,evidenceRequired:true,maxObjectiveChars:100};
  expect(configPinTuple(pin)).not.toEqual(configPinTuple({...pin,reviewSkills:['EVIDENCE_GAPS']}));
 });
});
