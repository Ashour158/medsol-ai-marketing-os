import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService} from './prisma.service.js';
import {ApproveObjectCommand} from '@medsol/contracts';
import {assertCampaignTransition} from '@medsol/domain';
import {randomUUID} from 'node:crypto';
import {MarketingWorkflowService} from './marketing-workflow.service.js';

@Injectable() export class ApprovalService{
 constructor(private readonly db:PrismaService,private readonly workflows:MarketingWorkflowService){}
 async approve(cmd:ApproveObjectCommand){
  const prior=await this.db.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:cmd.organizationId,commandId:cmd.commandId}}});if(prior)return prior.response;
  const result=await this.db.$transaction(async tx=>{
   const a=await tx.approval.findFirst({where:{id:cmd.approvalId,organizationId:cmd.organizationId}});if(!a)throw new NotFoundException('Approval not found in tenant');
   if(a.decision!=='PENDING')throw new BadRequestException('Approval is already decided');
   if(a.requiredAuthority==='AGENT')throw new ForbiddenException('Human authority is required for this approval');
   const next=await tx.approval.update({where:{id:a.id},data:{decision:cmd.decision,decidedBy:cmd.approverUserId,rationale:cmd.rationale,decidedAt:new Date()}});
   if(next.decision==='APPROVED' || next.decision==='APPROVED_WITH_CONDITIONS'){
    if(next.objectType==='Campaign'){
     const c=await tx.campaign.findFirst({where:{id:next.objectId,organizationId:cmd.organizationId}});if(!c)throw new NotFoundException('Approval target campaign not found');
     assertCampaignTransition(c.status,'APPROVED');
     const updated=await tx.campaign.update({where:{id:c.id},data:{status:'APPROVED',version:{increment:1}}});
     await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:'HUMAN',actorId:cmd.approverUserId,action:'CAMPAIGN_APPROVED',objectType:'Campaign',objectId:c.id,before:{status:c.status,version:c.version},after:{status:updated.status,version:updated.version},correlationId:cmd.correlationId}});
     await tx.outboxEvent.create({data:{organizationId:cmd.organizationId,eventId:randomUUID(),eventType:'CampaignApproved',aggregateType:'Campaign',aggregateId:c.id,payload:{campaignId:c.id,status:updated.status,approvalId:a.id},correlationId:cmd.correlationId}});
    }
   }
   await tx.commandReceipt.create({data:{organizationId:cmd.organizationId,commandId:cmd.commandId,commandType:'ApproveObject',correlationId:cmd.correlationId,status:'COMPLETED',response:{approvalId:a.id,decision:next.decision}}});
   await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:'HUMAN',actorId:cmd.approverUserId,action:'APPROVAL_DECIDED',objectType:a.objectType,objectId:a.objectId,before:{decision:a.decision},after:{decision:next.decision,rationale:cmd.rationale},correlationId:cmd.correlationId}});
   return{approvalId:a.id,decision:next.decision};
  });
  if(result.decision==='APPROVED' || result.decision==='APPROVED_WITH_CONDITIONS') await this.workflows.completeAfterApproval(cmd.correlationId,cmd.organizationId,result);
  return result;
 }
}