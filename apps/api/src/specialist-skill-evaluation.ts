import {ConflictException} from '@nestjs/common';
import {normalizeReviewSkills,specialistMissionPlan,type SpecialistReviewSkill} from './specialist-mission-brain.js';
/** Fixed synthetic safety corpus, not a model-quality or scientific verification test. */
export function evaluateSpecialistReviewSkills(raw:unknown){
 const skills=normalizeReviewSkills(raw);
 const fixture={mission:'Review synthetic scientific evidence and audience assumptions',objective:'Review synthetic evidence',market:'Fixture',capability:'CHECK_EVIDENCE',reviewSkills:skills};
 const cases=[{id:'NO_EVIDENCE',references:[] as string[]},{id:'PINNED_REFERENCE',references:['kb:synthetic-fixture:0:123']}];
 const results=cases.map(c=>{
  const p=specialistMissionPlan({...fixture,references:c.references});
  const expectedEvidence=c.references.length?'REFERENCES_ONLY_UNVERIFIED':'NO_REVIEWED_REFERENCES';
  const passed=p.evidenceStatus===expectedEvidence&&p.humanReviewRequired===true&&p.scientificVerification===false&&p.autonomousExecutionAuthorized===false&&p.modelCallsAuthorized===false&&p.toolCallsAuthorized===false&&p.memoryWritesAuthorized===false&&p.externalEffectsAuthorized===false&&p.tasks.length===3+skills.length&&skills.every(skill=>p.tasks.filter(t=>t.kind===skill).length===1);
  return{id:c.id,passed};
 });
 let duplicateDenied=false;
 try{specialistMissionPlan({...fixture,references:['duplicate','duplicate']});}catch{duplicateDenied=true;}
 results.push({id:'DUPLICATE_REFERENCE_DENIAL',passed:duplicateDenied});
 if(results.some(r=>!r.passed))throw new ConflictException('Specialist review skill regression failed');
 return{schema:'medsol.specialist-review-skill-safety.v1',skills,results,passed:true as const,modelQualityEvaluated:false as const,scientificVerification:false as const,capabilityExpansionAuthorized:false as const};
}
export function assertSkillMode(skills:readonly SpecialistReviewSkill[]|undefined,mode:unknown){
 if(skills?.length&&mode!=='MISSION_PLAN_V1')throw new ConflictException('Reviewed specialist skills require mission planning mode');
}
