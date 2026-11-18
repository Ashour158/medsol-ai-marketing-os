import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService} from './prisma.service.js';
import {ApproveObjectCommand} from '@medsol/contracts';
import {assertCampaignTransition} from '@medsol/domain';
import {randomUUID} from 'node:crypto';
import {assertIndependentCampaignReviewer} from './campaign-segregation.js';
import {MarketingWorkflowService} from './marketing-workflow.service.js';
import {exactCreativeScopeHash,isExactCreativeScope} from './exact-creative-scope.js';

@Injectable() export class ApprovalService{
 constructor(private readonly db:PrismaService,private readonly workflows:MarketingWorkflowService){}
 async listPending(organizationId:string){return this.db.approval.findMany({where:{organizationId,decision:'PENDING'},orderBy:{createdAt:'asc'},select:{id:true,objectType:true,objectId:true,requiredAuthority:true,riskLevel:true,workflowExecutionId:true,scopeDigest:true,scopeExpiresAt:true,createdAt:true}})}
 private async reconcile(organizationId:string,result:{approvalId:string;decision:string;workflowExecutionId:string|null}){
  if(result.decision==='APPROVED' || result.decision==='APPROVED_WITH_CONDITIONS') await this.workflows.completeAfterApproval(result.workflowExecutionId,organizationId,result);
  if(result.decision==='REJECTED') await this.workflows.blockAfterApprovalRejection(result.approvalId,organizationId,'Rejected by authorized reviewer');
 }
 async approve(cmd:ApproveObjectCommand){
  const prior=await this.db.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:cmd.organizationId,commandId:cmd.commandId}}});if(prior){await this.reconcile(cmd.organizationId,prior.response as any);return prior.response;}
  const result=await this.db.$transaction(async tx=>{
   // Creative DAM tables are FORCE-RLS; trusted tenant context must be
   // transaction-local and cannot survive pool reuse between requests.
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${cmd.organizationId}, true)`;
   const a=await tx.approval.findFirst({where:{id:cmd.approvalId,organizationId:cmd.organizationId}});if(!a)throw new NotFoundException('Approval not found in tenant');
   if(a.decision!=='PENDING')throw new BadRequestException('Approval is already decided');
   if(a.requiredAuthority==='AGENT')throw new ForbiddenException('Human authority is required for this approval');
   const reviewer=await tx.user.findFirst({where:{id:cmd.approverUserId,organizationId:cmd.organizationId}});
   if(!reviewer || !['ADMIN','SUPER_ADMIN','MARKETING_DIRECTOR','CMO'].includes(reviewer.role.toUpperCase()))throw new ForbiddenException('Approver lacks authorized marketing approval role');
   if(a.objectType==='Campaign' && cmd.decision==='APPROVED'){
    const history=await tx.auditEvent.findMany({where:{organizationId:cmd.organizationId,objectType:'Campaign',objectId:a.objectId,action:{in:['CAMPAIGN_CREATED','CAMPAIGN_STATUS_CHANGED']}},select:{actorType:true,actorId:true,action:true}});
    assertIndependentCampaignReviewer(cmd.approverUserId,history);
   }
   if(a.objectType==='CreativeAssetRevision'&&cmd.decision==='APPROVED'){
    const scope=a.scope;
    if(!isExactCreativeScope(scope)||!a.scopeDigest||!a.scopeExpiresAt||
       a.scopeExpiresAt<=new Date()||new Date(scope.scheduledAt)<=new Date()||
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
    if(!revision||!asset||!brand||!master||
       asset.version!==revision.version||
       revision.rightsReviewedAt===null||revision.rightsExpiresAt<=new Date(scope.scheduledAt)||
       scope.assetId!==asset.id||scope.brandId!==asset.brandId||
       scope.revisionId!==revision.id||scope.revisionVersion!==revision.version||
       scope.renditionDigest!==revision.renditionDigest||
       scope.sourceRef!==revision.sourceRef||
       scope.policyVersion!=='v'+master.version)
     throw new ConflictException('Current asset version, rights, brand or policy no longer matches');
    if(a.requestedBy===cmd.approverUserId||revision.createdBy===cmd.approverUserId)
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