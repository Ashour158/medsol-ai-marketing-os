import {BadRequestException} from '@nestjs/common';
import {isSpecialistId} from './offline-specialist.js';
import {normalizeReviewSkills,specialistMissionPlan,specialistPlanDigest,type SpecialistReviewSkill} from './specialist-mission-brain.js';
export function allocationInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='candidateIds,contextQuery,fixtureOnly,market,objective,requiredSkills')throw new BadRequestException('Exact specialist allocation preview required');
 const v=raw as Record<string,unknown>;
 if(v.fixtureOnly!==true||!Array.isArray(v.candidateIds)||v.candidateIds.length<1||v.candidateIds.length>8||!v.candidateIds.every(isSpecialistId)||new Set(v.candidateIds).size!==v.candidateIds.length||typeof v.objective!=='string'||v.objective.trim().length<12||v.objective.length>500||typeof v.market!=='string'||v.market.trim().length<2||v.market.length>100||typeof v.contextQuery!=='string'||v.contextQuery.trim().length<3||v.contextQuery.length>200)
  throw new BadRequestException('Bounded distinct candidates, objective, market and context query required');
 return{candidateIds:(v.candidateIds as string[]).slice().sort(),objective:v.objective.trim(),market:v.market.trim(),contextQuery:v.contextQuery.trim(),requiredSkills:normalizeReviewSkills(v.requiredSkills),fixtureOnly:true as const};
}
export type AllocationInput=ReturnType<typeof allocationInput>;
export type AllocationCandidate={agentId:string;mission:string;capability:string;configurationVersion:number;maxObjectiveChars:number;skills:SpecialistReviewSkill[];referenceCount:number};
export function rankSpecialists(input:AllocationInput,candidates:readonly AllocationCandidate[]){
 const ranked=candidates.map(c=>{
  const sharedTerms=specialistMissionPlan({mission:c.mission,objective:input.objective,market:input.market,capability:c.capability,references:[]}).sharedTerms;
  const missingSkills=input.requiredSkills.filter(skill=>!c.skills.includes(skill));
  const reasons=[...(input.objective.length>c.maxObjectiveChars?['OBJECTIVE_LIMIT']:[]),...(!sharedTerms.length?['NO_LEXICAL_OVERLAP']:[]),...(missingSkills.length?['REQUIRED_SKILLS_MISSING']:[]),...(!c.referenceCount?['NO_REVIEWED_REFERENCES']:[])];
  return{agentId:c.agentId,configurationVersion:c.configurationVersion,capability:c.capability,sharedTerms,missingSkills,referenceCount:c.referenceCount,eligible:reasons.length===0,reasons,score:sharedTerms.length*10+(input.requiredSkills.length-missingSkills.length)*5+Math.min(c.referenceCount,11)};
 }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score||a.agentId.localeCompare(b.agentId));
 return{schema:'medsol.specialist-allocation-preview.v1',candidates:ranked,recommendedAgentId:ranked.find(c=>c.eligible)?.agentId??null,previewOnly:true,semanticAlignmentVerified:false,scientificVerification:false,automaticAssignment:false,executionAuthorized:false,externalEffectsAuthorized:false};
}

export function allocationRequestInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='allocation,expectedAgentId,expectedPreviewDigest,fixtureOnly,requestKey')throw new BadRequestException('Exact allocation review request required');
 const v=raw as Record<string,unknown>,allocation=allocationInput(v.allocation);
 if(v.fixtureOnly!==true||typeof v.expectedAgentId!=='string'||!allocation.candidateIds.includes(v.expectedAgentId)||typeof v.expectedPreviewDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(v.expectedPreviewDigest)||typeof v.requestKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey))throw new BadRequestException('Expected preview digest, specialist and immutable request key required');
 return{allocation,expectedAgentId:v.expectedAgentId,expectedPreviewDigest:v.expectedPreviewDigest,requestKey:v.requestKey,fixtureOnly:true as const};
}
export function allocationPreviewDigest(org:string,actor:string,input:AllocationInput,result:ReturnType<typeof rankSpecialists>,pins:readonly unknown[]){
 return specialistPlanDigest(['medsol.specialist-allocation-preview.v1',org,actor,input,result,pins]);
}
export function allocationRequestDigest(org:string,actor:string,input:ReturnType<typeof allocationRequestInput>){
 return specialistPlanDigest(['medsol.specialist-allocation-request.v1',org,actor,input]);
}
