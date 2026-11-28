import {createHash} from 'node:crypto';
import {ConflictException} from '@nestjs/common';
export const SPECIALIST_BRAIN_MODE='MISSION_PLAN_V1' as const;
export const SPECIALIST_REVIEW_SKILLS=['CLAIM_LIMITATIONS','EVIDENCE_GAPS','AUDIENCE_FIT','MEASUREMENT_DESIGN'] as const;
export type SpecialistReviewSkill=typeof SPECIALIST_REVIEW_SKILLS[number];
const skillInstructions:Record<SpecialistReviewSkill,string>={
 CLAIM_LIMITATIONS:'Identify unsupported claims and explicitly record limitations for human review.',
 EVIDENCE_GAPS:'Identify missing or insufficient evidence and propose questions for independent verification.',
 AUDIENCE_FIT:'Review audience assumptions, accessibility and market relevance with an operator.',
 MEASUREMENT_DESIGN:'Propose measurable draft success criteria, baseline and validation questions.'
};
export function normalizeReviewSkills(raw:unknown):SpecialistReviewSkill[]{
 if(!Array.isArray(raw)||raw.length>SPECIALIST_REVIEW_SKILLS.length||raw.some(x=>typeof x!=='string'||!SPECIALIST_REVIEW_SKILLS.includes(x as SpecialistReviewSkill))||new Set(raw).size!==raw.length)throw new ConflictException('Invalid specialist review skill selection');
 return SPECIALIST_REVIEW_SKILLS.filter(x=>raw.includes(x));
}
type BrainInput={mission:string;objective:string;market:string;capability:string;references:readonly string[];reviewSkills?:readonly SpecialistReviewSkill[]};
const words=(s:string)=>new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g)??[]);
export function specialistMissionPlan(i:BrainInput){
 if(!i.mission.trim()||!i.objective.trim()||!i.market.trim()||!i.capability||i.references.length>11||new Set(i.references).size!==i.references.length)
  throw new ConflictException('Invalid bounded specialist plan inputs');
 const missionWords=words(i.mission),objectiveWords=words(i.objective);
 const sharedTerms=[...objectiveWords].filter(w=>missionWords.has(w)).sort().slice(0,20);
 const references=[...i.references].sort();
 const skills=i.reviewSkills===undefined?undefined:normalizeReviewSkills(i.reviewSkills);
 return {schema:'medsol.specialist-mission-plan.v1',mode:SPECIALIST_BRAIN_MODE,mission:i.mission,objective:i.objective,market:i.market,
  capability:i.capability,sharedTerms,alignmentSignal:sharedTerms.length?'LEXICAL_OVERLAP':'HUMAN_ALIGNMENT_REVIEW_REQUIRED',
  evidenceStatus:references.length?'REFERENCES_ONLY_UNVERIFIED':'NO_REVIEWED_REFERENCES',
  tasks:[{kind:'SCOPE_REVIEW',description:'Confirm objective belongs to the reviewed specialist mission.'},
   {kind:'EVIDENCE_REVIEW',description:'Independently verify relevance and quality of the pinned references.',references},
   {kind:'DRAFT_REVIEW',description:'Review canonical assessment against the mission and identify unresolved claims.'},...(skills??[]).map(skill=>({kind:skill,description:skillInstructions[skill]}))],
  ...(skills!==undefined?{reviewSkills:skills}:{}),
  humanReviewRequired:true,scientificVerification:false,autonomousExecutionAuthorized:false,modelCallsAuthorized:false,
  toolCallsAuthorized:false,memoryWritesAuthorized:false,externalEffectsAuthorized:false};
}
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));
 return value;
}
export function specialistPlanDigest(p:unknown){
 return 'sha256:'+createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex');
}
