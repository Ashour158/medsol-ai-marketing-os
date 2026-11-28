import {BadRequestException,ConflictException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import type {SpecialistReviewSkill} from './specialist-mission-brain.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function learningEvaluationId(raw:unknown){
 if(typeof raw!=='string'||!uuid.test(raw))throw new BadRequestException('Recorded retrieval evaluation ID required');
 return raw;
}
const metric=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export function recommendReviewSkill(recall:number,precision:number):SpecialistReviewSkill{
 if(!metric(recall)||!metric(precision))throw new ConflictException('Invalid retrieval metrics');
 // A retrieval gap suggests review of missing evidence, not a new capability.
 // Perfect retrieval still does not verify claims.
 return recall<1||precision<1?'EVIDENCE_GAPS':'CLAIM_LIMITATIONS';
}
export type LearningEvidence={evaluationId:string;recordedAt:string;cases:number;cutoff:number;hits:number;recallAtK:number;precisionAtK:number;recommendedSkill:SpecialistReviewSkill;diagnosticDigest:string;independentlyVerified:false;automaticPromotion:false};
export function learningEvidenceTuple(p:LearningEvidence){
 if(!p||typeof p.evaluationId!=='string'||!uuid.test(p.evaluationId)||typeof p.recordedAt!=='string'||!Number.isFinite(Date.parse(p.recordedAt))||
 !integer(p.cases,1,12)||!integer(p.cutoff,1,10)||!integer(p.hits,0,p.cases)||!metric(p.recallAtK)||!metric(p.precisionAtK)||
 p.recommendedSkill!==recommendReviewSkill(p.recallAtK,p.precisionAtK)||typeof p.diagnosticDigest!=='string'||!/^sha256:[0-9a-f]{64}$/.test(p.diagnosticDigest)||p.independentlyVerified!==false||p.automaticPromotion!==false)
 throw new ConflictException('Invalid specialist learning evidence pin');
 return[p.evaluationId,p.recordedAt,p.cases,p.cutoff,p.hits,p.recallAtK,p.precisionAtK,p.recommendedSkill,p.diagnosticDigest,p.independentlyVerified,p.automaticPromotion];
}
export function normalizeLearningEvidence(p:LearningEvidence):LearningEvidence{
 learningEvidenceTuple(p);
 return{evaluationId:p.evaluationId,recordedAt:p.recordedAt,cases:p.cases,cutoff:p.cutoff,hits:p.hits,recallAtK:p.recallAtK,precisionAtK:p.precisionAtK,recommendedSkill:p.recommendedSkill,diagnosticDigest:p.diagnosticDigest,independentlyVerified:false,automaticPromotion:false};
}
export function assertLearningSelection(p:LearningEvidence,skills:readonly SpecialistReviewSkill[]|undefined){
 if(!skills?.includes(p.recommendedSkill))throw new ConflictException('Evidence-linked configuration must explicitly select the recommended planning competency');
}
/** A historical diagnostic is not a source-content grant. Only metadata enters the approval. */
export async function loadLearningEvidence(tx:Prisma.TransactionClient,org:string,agentId:string,id:string,now:Date):Promise<LearningEvidence>{
 const rows=await tx.auditEvent.findMany({where:{organizationId:org,action:'KNOWLEDGE_RETRIEVAL_EVALUATED',objectType:'KnowledgeRetrievalEvaluation',objectId:id,correlationId:id,actorType:'HUMAN'},take:2});
 const row=rows[0];
 if(rows.length!==1||!row||!row.actorId||row.occurredAt>now||now.getTime()-row.occurredAt.getTime()>7*86400000)
  throw new ConflictException('Recent tenant specialist retrieval diagnostic required');
 const p=row.after as Record<string,unknown>|null;
 if(!p||p.specialistAgentId!==agentId||p.evaluationSource!=='OPERATOR_LABELED_INTERNAL_CORPUS'||p.independentlyVerified!==false||p.claimVerification!==false||p.promotionAuthorized!==false||p.modelOrSkillPromotionAuthorized!==false||p.providerRequestsMade!==0||
 !integer(p.cases,1,12)||!integer(p.cutoff,1,10)||!integer(p.hits,0,p.cases)||!metric(p.recallAtK)||!metric(p.precisionAtK)||!Array.isArray(p.observations)||p.observations.length!==p.cases)
 throw new ConflictException('Invalid specialist retrieval diagnostic provenance');
 const digest='sha256:'+createHash('sha256').update(JSON.stringify([org,agentId,id,row.actorId,row.occurredAt.toISOString(),p.cases,p.cutoff,p.hits,p.recallAtK,p.precisionAtK])).digest('hex');
 return normalizeLearningEvidence({evaluationId:id,recordedAt:row.occurredAt.toISOString(),cases:p.cases,cutoff:p.cutoff,hits:p.hits,recallAtK:p.recallAtK,precisionAtK:p.precisionAtK,recommendedSkill:recommendReviewSkill(p.recallAtK,p.precisionAtK),diagnosticDigest:digest,independentlyVerified:false,automaticPromotion:false});
}
