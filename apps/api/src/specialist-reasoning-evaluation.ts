import {ConflictException} from '@nestjs/common';
import {specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
import {specialistDecision} from './specialist-decision-brain.js';
import type {SpecialistContextPin} from './specialist-context-pin.js';
export const REASONING_EVALUATION_MODE='DECISION_EVALUATION_V1' as const;
type Plan=ReturnType<typeof specialistMissionPlan>;
type Decision=ReturnType<typeof specialistDecision>;
/** Fixed, explicitly labelled counterfactual decision-policy corpus, not a
 * statistical measure of AI reasoning, semantic alignment or scientific accuracy.
 * Never sends tenant data to the fixture, mutates memory or promotes skills.
 */
const CORPUS=[
 {id:'DENIED_ALIGNED_EVIDENCE',allowed:false,aligned:true,evidence:true,expected:'TEMPLATE_BLOCKED'},
 {id:'DENIED_ALIGNED_EMPTY',allowed:false,aligned:true,evidence:false,expected:'TEMPLATE_BLOCKED'},
 {id:'DENIED_UNALIGNED_EVIDENCE',allowed:false,aligned:false,evidence:true,expected:'TEMPLATE_BLOCKED'},
 {id:'DENIED_UNALIGNED_EMPTY',allowed:false,aligned:false,evidence:false,expected:'TEMPLATE_BLOCKED'},
 {id:'ALLOWED_UNALIGNED_EVIDENCE',allowed:true,aligned:false,evidence:true,expected:'ESCALATE_SCOPE'},
 {id:'ALLOWED_UNALIGNED_EMPTY',allowed:true,aligned:false,evidence:false,expected:'ESCALATE_SCOPE'},
 {id:'ALLOWED_ALIGNED_EMPTY',allowed:true,aligned:true,evidence:false,expected:'REQUEST_EVIDENCE'},
 {id:'ALLOWED_ALIGNED_EVIDENCE',allowed:true,aligned:true,evidence:true,expected:'DRAFT_FOR_REVIEW'}
] as const;
export function evaluateSpecialistReasoning(plan:Plan,decision:Decision,pin?:SpecialistContextPin){
 const actual=specialistDecision(plan,decision.signals.templateAllowed);
 if(specialistPlanDigest(actual)!==specialistPlanDigest(decision))throw new ConflictException('Specialist decision evaluation integrity mismatch');
 const references=pin?.references??[];
 const planReferences=plan.tasks.find(t=>t.kind==='EVIDENCE_REVIEW');
 if(!planReferences||!('references' in planReferences)||specialistPlanDigest([...references.map(r=>r.citationRef)].sort())!==specialistPlanDigest(planReferences.references))throw new ConflictException('Specialist evaluation reference integrity mismatch');
 const results=CORPUS.map(c=>{
  const fixture=specialistMissionPlan({mission:'Review scientific evidence',objective:c.aligned?'Review scientific evidence':'Design unrelated posters',market:'Synthetic',capability:'CHECK_EVIDENCE',references:c.evidence?['kb:fixture:0:123']:[],...(plan.reviewSkills!==undefined?{reviewSkills:plan.reviewSkills}:{})});
  const observed=specialistDecision(fixture,c.allowed);
  return{id:c.id,expected:c.expected,observed:observed.disposition,passed:observed.disposition===c.expected&&observed.candidates.filter(x=>x.eligible).length===1&&observed.draftEligible===(c.expected==='DRAFT_FOR_REVIEW')&&observed.humanReviewRequired===true&&observed.scientificVerification===false&&observed.semanticAlignmentVerified===false&&observed.autonomousExecutionAuthorized===false&&observed.modelCallsAuthorized===false&&observed.toolCallsAuthorized===false&&observed.memoryWritesAuthorized===false&&observed.externalEffectsAuthorized===false};
 });
 if(results.some(r=>!r.passed))throw new ConflictException('Specialist counterfactual decision regression failed');
 return{schema:'medsol.specialist-decision-evaluation.v1',mode:REASONING_EVALUATION_MODE,decisionDigest:specialistPlanDigest(decision),results,passedCases:results.filter(r=>r.passed).length,totalCases:CORPUS.length,
  evidenceDiagnostics:{sourceReferences:references.filter(r=>r.kind==='SOURCE').length,memoryReferences:references.filter(r=>r.kind==='MEMORY').length,distinctDocuments:new Set(references.map(r=>r.documentId)).size,independentlyVerified:false},
  fixtureOnly:true,modelQualityEvaluated:false,scientificVerification:false,semanticAlignmentVerified:false,automaticLearning:false,externalEffectsAuthorized:false};
}
