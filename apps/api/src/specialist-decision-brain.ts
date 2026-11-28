import {ConflictException} from '@nestjs/common';
import {specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
export const SPECIALIST_DECISION_MODE='SPECIALIST_DECISION_V1' as const;
type Plan=ReturnType<typeof specialistMissionPlan>;
type Disposition='TEMPLATE_BLOCKED'|'ESCALATE_SCOPE'|'REQUEST_EVIDENCE'|'DRAFT_FOR_REVIEW';
/** A deterministic decision policy over independently computed mission signals.
 * A draft is not an approval, claim verification or semantic/model reasoning.
 */
export function specialistDecision(plan:Plan,templateAllowed:boolean){
 if(typeof templateAllowed!=='boolean'||plan.humanReviewRequired!==true||plan.scientificVerification!==false||plan.externalEffectsAuthorized!==false||plan.modelCallsAuthorized!==false||plan.toolCallsAuthorized!==false||plan.memoryWritesAuthorized!==false||plan.autonomousExecutionAuthorized!==false)
  throw new ConflictException('Specialist decision requires a bounded draft');
 const aligned=plan.alignmentSignal==='LEXICAL_OVERLAP',hasEvidence=plan.evidenceStatus==='REFERENCES_ONLY_UNVERIFIED';
 const candidates:{disposition:Disposition;eligible:boolean;reason:string;priority:number}[]=[
  {disposition:'TEMPLATE_BLOCKED',eligible:!templateAllowed,reason:'Canonical policy denied the template assessment.',priority:4},
  {disposition:'ESCALATE_SCOPE',eligible:templateAllowed&&!aligned,reason:'No lexical mission overlap; human scope review is required.',priority:3},
  {disposition:'REQUEST_EVIDENCE',eligible:templateAllowed&&aligned&&!hasEvidence,reason:'No reviewed references; request evidence before drafting.',priority:2},
  {disposition:'DRAFT_FOR_REVIEW',eligible:templateAllowed&&aligned&&hasEvidence,reason:'Lexical overlap and references permit a draft for review only.',priority:1}
 ];
 const selected=candidates.filter(c=>c.eligible).sort((a,b)=>b.priority-a.priority)[0];
 if(!selected)throw new ConflictException('Specialist decision has no eligible disposition');
 return{schema:'medsol.specialist-decision.v1',mode:SPECIALIST_DECISION_MODE,planDigest:specialistPlanDigest(plan),
  signals:{templateAllowed,lexicalMissionOverlap:aligned,reviewedReferencesPresent:hasEvidence},candidates,disposition:selected.disposition,rationale:selected.reason,
  draftEligible:selected.disposition==='DRAFT_FOR_REVIEW',humanReviewRequired:true,semanticAlignmentVerified:false,scientificVerification:false,
  autonomousExecutionAuthorized:false,modelCallsAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false,externalEffectsAuthorized:false};
}
