import {describe,it,expect} from 'vitest';
import {allocationInput,rankSpecialists,type AllocationCandidate} from './specialist-allocation.js';
const a='MKT-SPECIALIST-alpha',b='MKT-SPECIALIST-beta',c='MKT-SPECIALIST-gamma';
const raw={candidateIds:[b,a,c],objective:'Review scientific evidence',market:'Egypt',contextQuery:'scientific evidence',requiredSkills:['EVIDENCE_GAPS'],fixtureOnly:true};
const candidate:AllocationCandidate={agentId:a,mission:'Review scientific evidence',capability:'CHECK_EVIDENCE',configurationVersion:1,maxObjectiveChars:100,skills:['EVIDENCE_GAPS'],referenceCount:2};
describe('specialist allocation preview',()=>{
 it('ranks eligible candidates ahead of unavailable evidence or missing competencies',()=>{
  const input=allocationInput(raw);
  const result=rankSpecialists(input,[{...candidate,agentId:c,referenceCount:0},{...candidate,agentId:b,skills:[],referenceCount:11},candidate]);
  expect(result).toMatchObject({recommendedAgentId:a,previewOnly:true,automaticAssignment:false,executionAuthorized:false,semanticAlignmentVerified:false,scientificVerification:false,externalEffectsAuthorized:false});
  expect(result.candidates[0]).toMatchObject({agentId:a,eligible:true});
  expect(result.candidates.find(x=>x.agentId===b)?.reasons).toContain('REQUIRED_SKILLS_MISSING');
  expect(result.candidates.find(x=>x.agentId===c)?.reasons).toContain('NO_REVIEWED_REFERENCES');
  expect(rankSpecialists(input,[{...candidate,maxObjectiveChars:12}]).recommendedAgentId).toBeNull();
  expect(rankSpecialists(input,[{...candidate,mission:'Design unrelated images'}]).recommendedAgentId).toBeNull();
 });
 it('normalizes ordering and breaks ties by specialist identity',()=>{
  const input=allocationInput(raw);
  expect(input.candidateIds).toEqual([a,b,c]);
  expect(rankSpecialists(input,[{...candidate,agentId:b},candidate]).recommendedAgentId).toBe(a);
 });
 it('denies duplicates, unreviewable inputs and unexpected authority',()=>{
  for(const invalid of [{...raw,candidateIds:[a,a]},{...raw,candidateIds:['MKT-SCI-001']},{...raw,candidateIds:[]},{...raw,requiredSkills:['UNKNOWN']},{...raw,contextQuery:''},{...raw,fixtureOnly:false},{...raw,autoApprove:true}])expect(()=>allocationInput(invalid)).toThrow();
 });
});
