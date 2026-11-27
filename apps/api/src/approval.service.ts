import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {ApproveObjectCommand} from '@medsol/contracts';
import {assertCampaignTransition} from '@medsol/domain';
import {randomUUID} from 'node:crypto';
import {SYNTHETIC_LEAD_REVIEW,currentSyntheticLeadTarget,matchSyntheticQualification} from './synthetic-lead-qualification.js';
import {SYNTHETIC_EXPERIMENT,readSyntheticExperiment,validateSyntheticExperimentApproval} from './synthetic-experiment.js';
import {SYNTHETIC_PRICING,readPriceProposal,validatePriceProposalApproval} from './synthetic-price-proposal.js';
import {SYNTHETIC_CAMPAIGN_PLAN,readChannelPlan,validateChannelPlanApproval} from './synthetic-campaign-channel-plan.js';
import {ACTIVATION_REVIEW,readActivationReview,validateActivationReview} from './customer-activation-review.js';
import {OFFLINE_SUBSCRIPTION,readSubscription,validateSubscriptionDecision} from './offline-subscription.js';
import {LOYALTY,readLoyalty,validateLoyaltyApproval} from './synthetic-loyalty.js';
import {communityReviewMatches,COMMUNITY_REVIEW_OBJECT} from './community-review-scope.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {assertIndependentCampaignReviewer} from './campaign-segregation.js';
import {MarketingWorkflowService} from './marketing-workflow.service.js';
import {offlineDagDigest,verifyOfflineDagSignature,offlineDagTrust}
 from './r3g-offline-dag.js';
import {assertDagEvidenceCurrent} from './r3g-dag-evidence.js';
import {EXACT_APPROVAL_EXECUTION_GRACE_MS,exactCreativeScopeHash,isExactCreativeScope} from './exact-creative-scope.js';

@Injectable() export class ApprovalService{
 constructor(private readonly db:PrismaService,private readonly workflows:MarketingWorkflowService){}
 async listPending(organizationId:string){return withMarketingTenant(this.db,organizationId,async tx=>{
  const pending=await tx.approval.findMany({where:{organizationId,decision:'PENDING'},orderBy:{createdAt:'asc'}});
  const ids=[...new Set(pending.filter(a=>a.objectType===COMMUNITY_REVIEW_OBJECT).map(a=>a.objectId))];
  const cases=ids.length?await tx.socialCommunityCase.findMany({where:{organizationId,id:{in:ids},status:'PENDING_REVIEW'}}):[];
  return pending.filter(a=>a.objectType!==COMMUNITY_REVIEW_OBJECT||cases.some(row=>communityReviewMatches(row,a)))
   .map(({id,objectType,objectId,requiredAuthority,riskLevel,workflowExecutionId,scopeDigest,scopeExpiresAt,createdAt})=>
    ({id,objectType,objectId,requiredAuthority,riskLevel,workflowExecutionId,scopeDigest,scopeExpiresAt,createdAt}));
 })}

 private async reconcile(organizationId:string,result:{approvalId:string;decision:string;workflowExecutionId:string|null}){
  if(result.decision==='APPROVED' || result.decision==='APPROVED_WITH_CONDITIONS') await this.workflows.completeAfterApproval(result.workflowExecutionId,organizationId,result);
  if(result.decision==='REJECTED') await this.workflows.blockAfterApprovalRejection(result.approvalId,organizationId,'Rejected by authorized reviewer');
 }
 async approve(cmd:ApproveObjectCommand){
  const prior=await withMarketingTenant(this.db,cmd.organizationId,tx=>tx.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:cmd.organizationId,commandId:cmd.commandId}}}));if(prior){await this.reconcile(cmd.organizationId,prior.response as any);return prior.response;}
  const result=await this.db.$transaction(async tx=>{
   // Creative DAM tables are FORCE-RLS; trusted tenant context must be
   // transaction-local and cannot survive pool reuse between requests.
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${cmd.organizationId}, true)`;
   const a=await tx.approval.findFirst({where:{id:cmd.approvalId,organizationId:cmd.organizationId}});if(!a)throw new NotFoundException('Approval not found in tenant');
   if(a.decision!=='PENDING')throw new BadRequestException('Approval is already decided');
   if(a.requiredAuthority==='AGENT')throw new ForbiddenException('Human authority is required for this approval');
   const reviewer=await tx.user.findFirst({where:{id:cmd.approverUserId,organizationId:cmd.organizationId,disabledAt:null}});
   if(!reviewer || !['ADMIN','SUPER_ADMIN','MARKETING_DIRECTOR','CMO'].includes(reviewer.role.toUpperCase()))throw new ForbiddenException('Approver lacks authorized marketing approval role');
   if(a.objectType===COMMUNITY_REVIEW_OBJECT){
    // Serialize decisions against case reopening; stale reviews cannot win a race.
    await tx.$queryRaw`SELECT "id" FROM "SocialCommunityCase" WHERE "organizationId"=${cmd.organizationId} AND "id"=${a.objectId} FOR UPDATE`;
    const row=await tx.socialCommunityCase.findFirst({where:{organizationId:cmd.organizationId,id:a.objectId,status:'PENDING_REVIEW'}});
    if(!row||!communityReviewMatches(row,a))
     throw new ConflictException('Current exact community review round required');
    if(cmd.approverUserId===row.createdBy||cmd.approverUserId===row.assignedTo||!reviewer.oidcSubject)
     throw new ForbiddenException('Independent OIDC community review required');
    await assertActorPermissionInTenantTransaction(tx,{organizationId:cmd.organizationId,userId:reviewer.id,
     email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject},'DECIDE_APPROVAL');
    if(!await tx.brand.findFirst({where:{organizationId:cmd.organizationId,id:row.brandId,status:'ACTIVE'}}))
     throw new ConflictException('Active community brand required');
   }
   if(a.objectType==='BlueprintWorkflowStep'){
    if(!a.workflowExecutionId||a.requestedBy===cmd.approverUserId)
     throw new ForbiddenException('Independent human decision required for pinned DAG step');
    const workflow=await tx.workflowExecution.findFirst({where:{
      id:a.workflowExecutionId,organizationId:cmd.organizationId,
      workflowType:'BLUEPRINT_OFFLINE_DAG',status:'WAITING_APPROVAL'
    }});
    const step=workflow&&await tx.workflowStepExecution.findFirst({where:{
      organizationId:cmd.organizationId,workflowExecutionId:workflow.id,
      stepKey:a.objectId,status:'WAITING_APPROVAL'
    }});
    const input=workflow?.input as {releaseDigest?:string;
     deploymentId?:string}|undefined;
    const scope=a.scope as {nodeId?:string;stepId?:string;
     deploymentId?:string;releaseDigest?:string;
     externalEffectsAuthorized?:boolean}|null;
    if(!workflow||!step||!scope||scope.nodeId!==a.objectId||
       scope.stepId!==step.id||scope.releaseDigest!==input?.releaseDigest||
       scope.deploymentId!==input?.deploymentId||
       scope.externalEffectsAuthorized!==false||
       a.scopeDigest!==input?.releaseDigest)
      throw new ConflictException('Human review must match a pending pinned offline DAG step');
    // R3-J: an approval must not launder a revoked or untrusted release back
    // into RUNNING. This transaction rechecks provenance at decision time.
    if(cmd.decision==='APPROVED'){
     const release=await tx.blueprintDeployment.findFirst({where:{
      id:input.deploymentId??'',organizationId:cmd.organizationId,
      status:{in:['ACTIVE','SUPERSEDED','APPROVED']}
     }});
     if(!release||release.digest!==input.releaseDigest||
        offlineDagDigest(release.manifest)!==release.digest||
        !verifyOfflineDagSignature(release.manifest,release.signature,
         release.signerKeyId,offlineDagTrust()))
      throw new ConflictException('Pinned DAG release revoked or signature untrusted at human decision');
     // The existing ApprovalService is also the evidence-release gate.
     // A source revoked AFTER an agent checkpoint but BEFORE independent
     // approval cannot be laundered into a successful human decision.
     if((workflow.input as {knowledgeMode?:string}).knowledgeMode==='CITATIONS_REQUIRED'){
      const priorSteps=await tx.workflowStepExecution.findMany({where:{
       organizationId:cmd.organizationId,workflowExecutionId:workflow.id,
       status:'COMPLETED'
      }});
      for(const priorStep of priorSteps){
       const metadata=priorStep.input as {type?:string};
       if(metadata?.type!=='AGENT_TASK')continue;
       const output=priorStep.output as {knowledgeMode?:string;evidenceRefs?:unknown}|null;
       if(output?.knowledgeMode!=='CITATIONS_REQUIRED')
        throw new ConflictException('Pinned DAG agent evidence checkpoint missing');
       await assertDagEvidenceCurrent(tx,cmd.organizationId,output.evidenceRefs);
      }
     }
    }
   }
   if(a.objectType==='Campaign' && cmd.decision==='APPROVED'){
    const history=await tx.auditEvent.findMany({where:{organizationId:cmd.organizationId,objectType:'Campaign',objectId:a.objectId,action:{in:['CAMPAIGN_CREATED','CAMPAIGN_STATUS_CHANGED']}},select:{actorType:true,actorId:true,action:true}});
    assertIndependentCampaignReviewer(cmd.approverUserId,history);
   }
   if(a.objectType===SYNTHETIC_LEAD_REVIEW){
    const target=cmd.decision==='APPROVED'?await currentSyntheticLeadTarget(tx,cmd.organizationId,a.objectId):
     await tx.marketingConversionSubmission.findFirst({where:{organizationId:cmd.organizationId,id:a.objectId},include:{form:true}});
    if(!target||!matchSyntheticQualification(target,a))
     throw new ConflictException('Exact synthetic lead qualification scope invalid or stale');
    if(cmd.approverUserId===a.requestedBy||cmd.approverUserId===target.createdBy||!reviewer.oidcSubject)
     throw new ForbiddenException('Independent OIDC synthetic lead review required');
    await assertActorPermissionInTenantTransaction(tx,{organizationId:cmd.organizationId,userId:reviewer.id,
     email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject},'DECIDE_APPROVAL');
   }
   if(a.objectType===LOYALTY){
    const scope=readLoyalty(a);
    if(cmd.approverUserId===scope.requestedBy||!reviewer.oidcSubject)throw new ForbiddenException('Independent OIDC loyalty review required');
    await assertActorPermissionInTenantTransaction(tx,{organizationId:cmd.organizationId,userId:reviewer.id,email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject},'DECIDE_APPROVAL');
    if(cmd.decision==='APPROVED')await validateLoyaltyApproval(tx,a,new Date());
   }
   if(a.objectType===OFFLINE_SUBSCRIPTION){
    const scope=readSubscription(a);
    if(cmd.approverUserId===scope.requestedBy||!reviewer.oidcSubject)throw new ForbiddenException('Independent OIDC subscription reviewer required');
    const actor={organizationId:cmd.organizationId,userId:reviewer.id,email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject};
    await assertActorPermissionInTenantTransaction(tx,actor,'MANAGE_TENANT');
    await assertActorPermissionInTenantTransaction(tx,actor,'DECIDE_APPROVAL');
    if(cmd.decision==='APPROVED')await validateSubscriptionDecision(tx,a,reviewer.id,new Date());
   }
   if(a.objectType===ACTIVATION_REVIEW){
    const scope=readActivationReview(a);
    if(cmd.approverUserId===scope.requestedBy||!reviewer.oidcSubject)throw new ForbiddenException('Independent OIDC activation review required');
    await assertActorPermissionInTenantTransaction(tx,{organizationId:cmd.organizationId,userId:reviewer.id,email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject},'DECIDE_APPROVAL');
    if(cmd.decision==='APPROVED')await validateActivationReview(tx,a,new Date());
   }
   if(a.objectType===SYNTHETIC_CAMPAIGN_PLAN){
    const scope=readChannelPlan(a);
    if(cmd.approverUserId===scope.requestedBy||!reviewer.oidcSubject)throw new ForbiddenException('Independent OIDC channel plan review required');
    await assertActorPermissionInTenantTransaction(tx,{organizationId:cmd.organizationId,userId:reviewer.id,email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject},'DECIDE_APPROVAL');
    if(cmd.decision==='APPROVED')await validateChannelPlanApproval(tx,a,new Date());
   }
   if(a.objectType===SYNTHETIC_PRICING){
    const scope=readPriceProposal(a);
    if(cmd.approverUserId===scope.requestedBy||!reviewer.oidcSubject)
     throw new ForbiddenException('Independent OIDC synthetic pricing review required');
    await assertActorPermissionInTenantTransaction(tx,{organizationId:cmd.organizationId,userId:reviewer.id,
     email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject},'DECIDE_APPROVAL');
    if(cmd.decision==='APPROVED')await validatePriceProposalApproval(tx,a,new Date());
   }
   if(a.objectType===SYNTHETIC_EXPERIMENT){
    const scope=readSyntheticExperiment(a);
    if(cmd.approverUserId===scope.requestedBy||!reviewer.oidcSubject)
     throw new ForbiddenException('Independent OIDC experiment review required');
    await assertActorPermissionInTenantTransaction(tx,{organizationId:cmd.organizationId,userId:reviewer.id,
     email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject},'DECIDE_APPROVAL');
    if(cmd.decision==='APPROVED')await validateSyntheticExperimentApproval(tx,a,new Date());
   }
   if(a.objectType==='MarketingConversionForm'&&cmd.decision==='APPROVED'){
    const form=await tx.marketingConversionForm.findFirst({where:{organizationId:cmd.organizationId,id:a.objectId,approvalId:a.id}});
    const campaign=form&&await tx.campaign.findFirst({where:{organizationId:cmd.organizationId,id:form.campaignId,
     brandId:form.brandId,status:'APPROVED',version:form.campaignVersion}});
    const brand=form&&await tx.brand.findFirst({where:{organizationId:cmd.organizationId,id:form.brandId,status:'ACTIVE'}});
    if(!form||!campaign||!brand||a.scopeDigest!==form.contentDigest||a.requestedBy!==form.createdBy)
     throw new ConflictException('Exact internal conversion form approval scope is stale or invalid');
    if(cmd.approverUserId===form.createdBy)
     throw new ForbiddenException('Independent conversion form approval required');
   }
   if(a.objectType==='CreativeAssetRevision'&&cmd.decision==='APPROVED'){
    const scope=a.scope;
    if(!isExactCreativeScope(scope)||!a.scopeDigest||!a.scopeExpiresAt||
       a.scopeExpiresAt<=new Date()||new Date(scope.scheduledAt)<=new Date()||
       Date.parse(scope.expiresAt)<=Date.parse(scope.scheduledAt)+EXACT_APPROVAL_EXECUTION_GRACE_MS||
       a.scopeExpiresAt.getTime()!==Date.parse(scope.expiresAt)||
       a.creativeAssetRevisionId!==a.objectId||
       exactCreativeScopeHash(scope)!==a.scopeDigest)
     throw new ConflictException('Exact creative scope expired, malformed or changed');
    const revision=await tx.creativeAssetRevision.findFirst({where:{
     organizationId:cmd.organizationId,id:a.objectId}});
    const asset=revision&&await tx.creativeAsset.findFirst({where:{
     organizationId:cmd.organizationId,id:revision.assetId,status:'ACTIVE'}});
    const brand=asset&&await tx.brand.findFirst({where:{
     organizationId:cmd.organizationId,id:asset.brandId,status:'ACTIVE'}});
    const master=await tx.brandMasterRevision.findFirst({where:{
     organizationId:cmd.organizationId,status:'APPROVED'},
     orderBy:{version:'desc'},select:{version:true}});
    if(!revision||revision.offlineLayeredSpec!=null||!asset||!brand||!master||
       asset.version!==revision.version||
       revision.rightsReviewedAt===null||revision.rightsExpiresAt<=new Date(scope.scheduledAt)||
       scope.assetId!==asset.id||scope.brandId!==asset.brandId||
       scope.revisionId!==revision.id||scope.revisionVersion!==revision.version||
       scope.renditionDigest!==revision.renditionDigest||
       scope.sourceRef!==revision.sourceRef||
       scope.policyVersion!=='v'+master.version)
     throw new ConflictException('Current asset version, rights, brand or policy no longer matches');
    if(a.requestedBy===cmd.approverUserId||revision.createdBy===cmd.approverUserId||
       asset.createdBy===cmd.approverUserId)
     throw new ForbiddenException('Independent creative approval reviewer required');
   }
   if(cmd.decision==='APPROVED_WITH_CONDITIONS')throw new BadRequestException('Conditional approval requires a conditions enforcement workflow and is not yet supported');
   const claimed=await tx.approval.updateMany({where:{id:a.id,organizationId:cmd.organizationId,decision:'PENDING'},data:{decision:cmd.decision,decidedBy:cmd.approverUserId,rationale:cmd.rationale,decidedAt:new Date()}});
   if(claimed.count!==1)throw new ConflictException('Approval was decided concurrently');
   const next=await tx.approval.findUniqueOrThrow({where:{id:a.id}});
   if(next.decision==='APPROVED' || next.decision==='APPROVED_WITH_CONDITIONS'){
    if(next.objectType==='Campaign'){
     const c=await tx.campaign.findFirst({where:{id:next.objectId,organizationId:cmd.organizationId}});if(!c)throw new NotFoundException('Approval target campaign not found');
     assertCampaignTransition(c.status,'APPROVED');
     const changed=await tx.campaign.updateMany({where:{id:c.id,organizationId:cmd.organizationId,status:c.status,version:c.version},data:{status:'APPROVED',version:{increment:1}}});
     if(changed.count!==1)throw new ConflictException('Campaign changed concurrently');
     const updated=await tx.campaign.findUniqueOrThrow({where:{id:c.id}});
     await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:'HUMAN',actorId:cmd.approverUserId,action:'CAMPAIGN_APPROVED',objectType:'Campaign',objectId:c.id,before:{status:c.status,version:c.version},after:{status:updated.status,version:updated.version},correlationId:cmd.correlationId}});
     await tx.outboxEvent.create({data:{organizationId:cmd.organizationId,eventId:randomUUID(),eventType:'CampaignApproved',aggregateType:'Campaign',aggregateId:c.id,payload:{campaignId:c.id,status:updated.status,approvalId:a.id},correlationId:cmd.correlationId,version:updated.version}});
    }
   }
   await tx.commandReceipt.create({data:{organizationId:cmd.organizationId,commandId:cmd.commandId,commandType:'ApproveObject',correlationId:cmd.correlationId,status:'COMPLETED',response:{approvalId:a.id,decision:next.decision,workflowExecutionId:a.workflowExecutionId}}});
   await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:'HUMAN',actorId:cmd.approverUserId,action:'APPROVAL_DECIDED',objectType:a.objectType,objectId:a.objectId,before:{decision:a.decision},after:{decision:next.decision,rationale:cmd.rationale},correlationId:cmd.correlationId}});
   if(a.objectType==='CreativeAssetRevision')await tx.auditEvent.create({data:{
    organizationId:cmd.organizationId,actorType:'HUMAN',actorId:cmd.approverUserId,
    action:'CREATIVE_SCOPE_DECIDED',objectType:'CreativeAssetRevision',objectId:a.objectId,
    correlationId:cmd.correlationId,after:{approvalId:a.id,scopeDigest:a.scopeDigest,
     decision:next.decision,externalEffectsAuthorized:false}
   }});
   if(next.decision==='REJECTED')await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:'HUMAN',actorId:cmd.approverUserId,action:'APPROVAL_BLOCKED_WORKFLOW',objectType:'WorkflowExecution',objectId:a.workflowExecutionId??a.id,before:{status:'WAITING_APPROVAL'},after:{status:'BLOCKED',approvalId:a.id},correlationId:cmd.correlationId}});
   return{approvalId:a.id,decision:next.decision,workflowExecutionId:a.workflowExecutionId};
  });
  await this.reconcile(cmd.organizationId,result);
  return result;
 }
}