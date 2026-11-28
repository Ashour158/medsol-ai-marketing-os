import {describe,it,expect} from 'vitest';
import {allocationInput,rankSpecialists,allocationRequestInput,allocationRequestDigest,allocationPreviewDigest,type AllocationCandidate} from './specialist-allocation.js';
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

describe('allocation review origin',()=>{
 it('pins preview identity and evidence and immutable request identity',()=>{
  const input=allocationInput(raw),result=rankSpecialists(input,[candidate]);
  const digest=allocationPreviewDigest('tenant-a','operator',input,result,[['pin-a']]);
  expect(digest).not.toBe(allocationPreviewDigest('tenant-b','operator',input,result,[['pin-a']]));
  expect(digest).not.toBe(allocationPreviewDigest('tenant-a','operator',input,result,[['pin-b']]));
  const command={allocation:raw,expectedAgentId:a,expectedPreviewDigest:digest,requestKey:'fixture-allocation-001',fixtureOnly:true};
  const exact=allocationRequestInput(command);
  expect(allocationRequestDigest('tenant-a','operator',exact)).not.toBe(allocationRequestDigest('tenant-a','other',exact));
  expect(()=>allocationRequestInput({...command,autoApprove:true})).toThrow();
  expect(()=>allocationRequestInput({...command,expectedAgentId:'MKT-SPECIALIST-other'})).toThrow();
  expect(()=>allocationRequestInput({...command,expectedPreviewDigest:'forged'})).toThrow();
 });
});
