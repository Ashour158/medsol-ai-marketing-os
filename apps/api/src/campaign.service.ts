import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService} from './prisma.service.js';
import {OutboxService} from './outbox.service.js';
import {assertCampaignTransition} from '@medsol/domain';
import {CreateCampaignCommand,TransitionCampaignCommand} from '@medsol/contracts';
import {randomUUID} from 'node:crypto';

@Injectable() export class CampaignService{
 constructor(private readonly db:PrismaService,private readonly outbox:OutboxService){}
 async create(cmd:CreateCampaignCommand){
  const prior=await this.db.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:cmd.organizationId,commandId:cmd.commandId}}});if(prior)return prior.response;
  return this.db.$transaction(async tx=>{
   const objective=await tx.marketingObjective.findFirst({where:{id:cmd.objectiveId,organizationId:cmd.organizationId}});if(!objective)throw new NotFoundException('Objective not found in tenant');
   if(cmd.productId){const p=await tx.marketingProduct.findFirst({where:{id:cmd.productId,organizationId:cmd.organizationId}});if(!p)throw new NotFoundException('Product not found in tenant')}
   const dup=await tx.campaign.findUnique({where:{organizationId_code:{organizationId:cmd.organizationId,code:cmd.code}}});if(dup)throw new ConflictException('Campaign code already exists');
   const c=await tx.campaign.create({data:{organizationId:cmd.organizationId,code:cmd.code,name:cmd.name,objectiveId:cmd.objectiveId,...(cmd.productId ? {productId:cmd.productId} : {}),riskLevel:cmd.riskLevel,status:'IDEA'}});
   const response={campaignId:c.id,status:c.status,version:c.version};
   await tx.commandReceipt.create({data:{organizationId:cmd.organizationId,commandId:cmd.commandId,commandType:'CreateCampaign',correlationId:cmd.correlationId,status:'COMPLETED',response}});
   await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:'AGENT',actorId:'MKT-OPS-001',action:'CAMPAIGN_CREATED',objectType:'Campaign',objectId:c.id,after:c as any,correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {})}});
   await this.outbox.enqueue(tx,{organizationId:cmd.organizationId,eventId:randomUUID(),eventType:'CampaignCreated',aggregateType:'Campaign',aggregateId:c.id,payload:{campaignId:c.id,code:c.code,status:c.status},correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {})});
   return response;
  });
 }
 async transition(cmd:TransitionCampaignCommand,actorType:'AGENT'|'HUMAN'='AGENT'){
  const prior=await this.db.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:cmd.organizationId,commandId:cmd.commandId}}});if(prior)return prior.response;
  return this.db.$transaction(async tx=>{
   const c=await tx.campaign.findFirst({where:{id:cmd.campaignId,organizationId:cmd.organizationId}});if(!c)throw new NotFoundException('Campaign not found in tenant');
   if(cmd.expectedVersion!==undefined && c.version!==cmd.expectedVersion)throw new ConflictException('Campaign version is stale; refresh the authoritative campaign state before retrying');
   try{assertCampaignTransition(c.status,cmd.to)}catch(e){throw new BadRequestException((e as Error).message)}
   if(cmd.to==='APPROVAL_PENDING'&&['R2','R3'].includes(c.riskLevel)){
    const existing=await tx.approval.findFirst({where:{organizationId:c.organizationId,objectType:'Campaign',objectId:c.id,decision:'PENDING'}});
    if(!existing)await tx.approval.create({data:{organizationId:c.organizationId,objectType:'Campaign',objectId:c.id,requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:c.riskLevel,...(cmd.workflowExecutionId ? {workflowExecutionId:cmd.workflowExecutionId} : {})}});
    else if(cmd.workflowExecutionId && !existing.workflowExecutionId)await tx.approval.update({where:{id:existing.id},data:{workflowExecutionId:cmd.workflowExecutionId}});
   }
   if(cmd.to==='APPROVED')throw new BadRequestException('Campaign approval must be executed through the authoritative ApprovalService with a recorded human decision');
   const changed=await tx.campaign.updateMany({where:{id:c.id,organizationId:cmd.organizationId,version:c.version,status:c.status},data:{status:cmd.to as any,version:{increment:1}}});
   if(changed.count!==1)throw new ConflictException('Campaign changed concurrently; reload and retry');
   const next=await tx.campaign.findUniqueOrThrow({where:{id:c.id}});
   const response={campaignId:c.id,status:next.status,version:next.version};
   await tx.commandReceipt.create({data:{organizationId:cmd.organizationId,commandId:cmd.commandId,commandType:'TransitionCampaign',correlationId:cmd.correlationId,status:'COMPLETED',response}});
   await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType,actorId:actorType==='AGENT'?'MKT-OPS-001':(cmd.causationId??'human'),action:'CAMPAIGN_STATUS_CHANGED',objectType:'Campaign',objectId:c.id,before:{status:c.status,version:c.version},after:{status:next.status,version:next.version},correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {})}});
   await this.outbox.enqueue(tx,{organizationId:cmd.organizationId,eventId:randomUUID(),eventType:'CampaignStatusChanged',aggregateType:'Campaign',aggregateId:c.id,payload:{campaignId:c.id,from:c.status,to:next.status,version:next.version},correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {}),version:next.version});
   return response;
  });
 }
}