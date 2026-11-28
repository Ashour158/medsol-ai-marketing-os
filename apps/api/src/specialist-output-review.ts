import {ConflictException} from '@nestjs/common';
import type {Approval,Prisma} from '@prisma/client';
import type {MarketingLearningService} from './marketing-learning.service.js';
import {SPECIALIST_REHEARSAL,readRehearsal,validateRehearsal} from './offline-specialist-rehearsal.js';
import {specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
import {specialistDecision} from './specialist-decision-brain.js';
import {STRUCTURED_DRAFT_MODE,prepareStructuredDraftFixture,structuredDraftFixture,structuredDraftFixtureReceipt} from './specialist-structured-model-draft.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
export const SPECIALIST_OUTPUT_REVIEW='OfflineSpecialistOutputReview';
type Fixture=ReturnType<typeof structuredDraftFixtureReceipt>;
const sha=(s:unknown):s is string=>typeof s==='string'&&/^sha256:[a-f0-9]{64}$/.test(s);
export const outputReviewId=(org:string,approvalId:string)=>'specialist-output-'+specialistPlanDigest([SPECIALIST_OUTPUT_REVIEW,org,approvalId]).slice(7);
export function outputReviewScope(i:{organizationId:string;requestedBy:string;agentId:string;sourceApprovalId:string;sourceScopeDigest:string;fixture:Fixture;expiresAt:string}){
 if(!i.organizationId||!i.requestedBy||!/^MKT-SPECIALIST-[a-z][a-z0-9-]{2,63}$/.test(i.agentId)||!/^specialist-run-[a-f0-9]{64}$/.test(i.sourceApprovalId)||!sha(i.sourceScopeDigest)||!Number.isFinite(Date.parse(i.expiresAt))||new Date(i.expiresAt).toISOString()!==i.expiresAt||i.fixture.schema!=='medsol.specialist-structured-draft-rehearsal.v1'||i.fixture.mode!==STRUCTURED_DRAFT_MODE||i.fixture.fixtureOnly!==true||i.fixture.outputHumanApproved!==false||i.fixture.executionAuthorized!==false||i.fixture.externalEffectsAuthorized!==false||i.fixture.providerRequestsMade!==0||i.fixture.realModelInvocations!==0||i.fixture.actualCostMicros!==0||i.fixture.draft.disposition!=='DRAFT_FOR_REVIEW'||i.fixture.draftDigest!==specialistPlanDigest(i.fixture.draft))throw new ConflictException('Exact bounded structured output review required');
 return{schema:'medsol.specialist-output-review.v1',organizationId:i.organizationId,requestedBy:i.requestedBy,agentId:i.agentId,sourceApprovalId:i.sourceApprovalId,sourceExecutionId:i.sourceApprovalId+'-execution',sourceScopeDigest:i.sourceScopeDigest,structuredDraftDigest:specialistPlanDigest(i.fixture),draft:i.fixture.draft,expiresAt:i.expiresAt,fixtureOnly:true,scientificVerification:false,modelQualityEvaluated:false,executionAuthorized:false,externalEffectsAuthorized:false};
}
type Scope=ReturnType<typeof outputReviewScope>;
export function readOutputReview(a:Approval):Scope{
 const s=a.scope as unknown as Scope;
 if(!s||s.schema!=='medsol.specialist-output-review.v1'||a.objectType!==SPECIALIST_OUTPUT_REVIEW||a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||s.organizationId!==a.organizationId||s.requestedBy!==a.requestedBy||s.agentId!==a.objectId||!/^specialist-run-[a-f0-9]{64}$/.test(s.sourceApprovalId)||s.sourceExecutionId!==s.sourceApprovalId+'-execution'||a.id!==outputReviewId(a.organizationId,s.sourceApprovalId)||!sha(s.sourceScopeDigest)||!sha(s.structuredDraftDigest)||!a.scopeExpiresAt||a.scopeExpiresAt.toISOString()!==s.expiresAt||s.fixtureOnly!==true||s.scientificVerification!==false||s.modelQualityEvaluated!==false||s.executionAuthorized!==false||s.externalEffectsAuthorized!==false||!s.draft||s.draft.disposition!=='DRAFT_FOR_REVIEW'||specialistPlanDigest(s)!==a.scopeDigest)throw new ConflictException('Invalid specialist output review evidence');
 return s;
}
/** Approval only accepts the exact historical fixture while its reviewed
 * source authorization remains current. No modification of AgentExecution. */
export async function validateOutputReview(tx:Prisma.TransactionClient,a:Approval,now:Date,learning?:MarketingLearningService){
 const s=readOutputReview(a);
 if(!a.scopeExpiresAt||a.scopeExpiresAt<=now)throw new ConflictException('Specialist output review expired');
 const source=await tx.approval.findFirst({where:{organizationId:a.organizationId,id:s.sourceApprovalId,objectType:SPECIALIST_REHEARSAL,decision:'APPROVED'}});
 if(!source||source.requestedBy!==s.requestedBy||source.objectId!==s.agentId||source.scopeDigest!==s.sourceScopeDigest||!source.decidedBy||source.decidedBy===s.requestedBy||!source.decidedAt||!source.scopeExpiresAt||source.decidedAt>=source.scopeExpiresAt)throw new ConflictException('Independent source rehearsal required');
 const scope=readRehearsal(source);
 if(scope.input.structuredDraftMode!==STRUCTURED_DRAFT_MODE||!scope.contextPin)throw new ConflictException('Reviewed structured draft scope required');
 await validateRehearsal(tx,source,now,learning);
 const reviewer=await tx.user.findFirst({where:{organizationId:a.organizationId,id:source.decidedBy,disabledAt:null},select:{id:true,email:true,role:true,oidcSubject:true}});
 if(!reviewer?.oidcSubject)throw new ConflictException('Current source reviewer required');
 const identity={organizationId:a.organizationId,userId:reviewer.id,email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject};
 await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
 await assertActorPermissionInTenantTransaction(tx,identity,'DECIDE_APPROVAL');
 const row=await tx.agentExecution.findFirst({where:{organizationId:a.organizationId,id:s.sourceExecutionId,correlationId:s.sourceApprovalId,agentId:s.agentId,status:'COMPLETED'}});
 const d=row?.decision as Record<string,unknown>|null|undefined;
 if(!d||d.approvalId!==source.id||d.scopeDigest!==source.scopeDigest||d.agentId!==s.agentId||d.templateAgentId!==scope.templateId||d.templateDigest!==scope.templateDigest||d.outputHumanApproved!==false||d.externalEffectsAuthorized!==false||d.modelCallsAuthorized!==false||!d.missionPlan||!d.specialistDecision||!d.structuredDraft||d.structuredDraftDigest!==s.structuredDraftDigest||d.outputReviewId!==a.id)throw new ConflictException('Exact completed structured fixture required');
 const prepared=prepareStructuredDraftFixture({organizationId:a.organizationId,approvalId:source.id,scopeDigest:s.sourceScopeDigest,templateAgentId:scope.templateId,plan:d.missionPlan as ReturnType<typeof specialistMissionPlan>,decision:d.specialistDecision as ReturnType<typeof specialistDecision>,contextPin:scope.contextPin});
 const expected=structuredDraftFixtureReceipt(prepared,structuredDraftFixture(prepared));
 if(specialistPlanDigest(expected)!==s.structuredDraftDigest||specialistPlanDigest(d.structuredDraft)!==s.structuredDraftDigest||specialistPlanDigest(expected.draft)!==specialistPlanDigest(s.draft))throw new ConflictException('Structured draft changed since review request');
 return s;
}
