import {createHash} from 'node:crypto';
import {ConflictException} from '@nestjs/common';
export const SPECIALIST_BRAIN_MODE='MISSION_PLAN_V1' as const;
type BrainInput={mission:string;objective:string;market:string;capability:string;references:readonly string[]};
const words=(s:string)=>new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g)??[]);
export function specialistMissionPlan(i:BrainInput){
 if(!i.mission.trim()||!i.objective.trim()||!i.market.trim()||!i.capability||i.references.length>11||new Set(i.references).size!==i.references.length)
  throw new ConflictException('Invalid bounded specialist plan inputs');
 const missionWords=words(i.mission),objectiveWords=words(i.objective);
 const sharedTerms=[...objectiveWords].filter(w=>missionWords.has(w)).sort().slice(0,20);
 const references=[...i.references].sort();
 return {schema:'medsol.specialist-mission-plan.v1',mode:SPECIALIST_BRAIN_MODE,mission:i.mission,objective:i.objective,market:i.market,
  capability:i.capability,sharedTerms,alignmentSignal:sharedTerms.length?'LEXICAL_OVERLAP':'HUMAN_ALIGNMENT_REVIEW_REQUIRED',
  evidenceStatus:references.length?'REFERENCES_ONLY_UNVERIFIED':'NO_REVIEWED_REFERENCES',
  tasks:[{kind:'SCOPE_REVIEW',description:'Confirm objective belongs to the reviewed specialist mission.'},
   {kind:'EVIDENCE_REVIEW',description:'Independently verify relevance and quality of the pinned references.',references},
   {kind:'DRAFT_REVIEW',description:'Review canonical assessment against the mission and identify unresolved claims.'}],
  humanReviewRequired:true,scientificVerification:false,autonomousExecutionAuthorized:false,modelCallsAuthorized:false,
  toolCallsAuthorized:false,memoryWritesAuthorized:false,externalEffectsAuthorized:false};
}
export function specialistPlanDigest(p:ReturnType<typeof specialistMissionPlan>){
 return 'sha256:'+createHash('sha256').update(JSON.stringify(p)).digest('hex');
}
