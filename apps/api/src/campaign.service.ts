import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import type {VerifiedIdentity} from './oidc-identity.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {SYNTHETIC_CAMPAIGN_PLAN,normalizeChannelPlan,channelPlanId,buildChannelPlan,readChannelPlan} from './synthetic-campaign-channel-plan.js';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {OutboxService} from './outbox.service.js';
import {assertCampaignTransition} from '@medsol/domain';
import {CreateCampaignCommand,TransitionCampaignCommand} from '@medsol/contracts';
import {randomUUID} from 'node:crypto';

@Injectable() export class CampaignService{
 constructor(private readonly db:PrismaService,private readonly outbox:OutboxService){}
 async proposeChannelPlan(org:string,identity:VerifiedIdentity,campaignId:string,raw:unknown){
  if(!identity||identity.organizationId!==org||!identity.subject)throw new ForbiddenException('Verified tenant channel operator required');
  const input=normalizeChannelPlan(raw),approvalId=channelPlanId(org,input.requestKey);
  for(let attempt=0;attempt<3;attempt++)try{
   return await withMarketingTenant(this.db,org,async tx=>{
    await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_CAMPAIGN');
    const prior=await tx.approval.findFirst({where:{organizationId:org,id:approvalId}});
    if(prior){
     const s=readChannelPlan(prior);
     if(s.requestedBy!==identity.userId||s.campaignId!==campaignId||JSON.stringify(s.input)!==JSON.stringify(input))throw new ConflictException('Immutable channel plan key already used');
     return{approvalId,decision:prior.decision,...s,replayed:true};
    }
    const {scope,scopeDigest}=await buildChannelPlan(tx,org,identity.userId,campaignId,input,new Date());
    await tx.approval.create({data:{id:approvalId,organizationId:org,objectType:SYNTHETIC_CAMPAIGN_PLAN,objectId:campaignId,
     requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R2',requestedBy:identity.userId,scope,scopeDigest,scopeExpiresAt:new Date(input.expiresAt)}});
    await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'SYNTHETIC_CHANNEL_PLAN_PROPOSED',
     objectType:SYNTHETIC_CAMPAIGN_PLAN,objectId:campaignId,correlationId:approvalId,after:{scopeDigest,kind:input.kind,externalEffectsAuthorized:false}}});
    return{approvalId,decision:'PENDING',...scope,replayed:false};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(e){const code=(e as {code?:string})?.code;if(code==='P2034'&&attempt<2)continue;
   if(code==='P2034'||code==='P2002')throw new ConflictException('Concurrent channel plan; refresh and retry same key');throw e;}
  throw new ConflictException('Channel proposal retry limit');
 }
 async channelPlans(org:string,identity:VerifiedIdentity,campaignId:string){
  if(!identity||identity.organizationId!==org||!identity.subject)throw new ForbiddenException('Verified tenant channel reviewer required');
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'READ_AUDIT');
   if(!await tx.campaign.findFirst({where:{organizationId:org,id:campaignId},select:{id:true}}))throw new NotFoundException('Tenant campaign not found');
   const rows=await tx.approval.findMany({where:{organizationId:org,objectType:SYNTHETIC_CAMPAIGN_PLAN,objectId:campaignId},orderBy:[{createdAt:'desc'},{id:'asc'}],take:101});
   return{plans:rows.slice(0,100).map(a=>({approvalId:a.id,decision:a.decision,...readChannelPlan(a),historicalOnly:true,expired:!!a.scopeExpiresAt&&a.scopeExpiresAt<=new Date()})),windowCapped:rows.length>100,externalEffectsAuthorized:false};
  });
 }
 async create(cmd:CreateCampaignCommand,actorId?:string){
  const prior=await withMarketingTenant(this.db,cmd.organizationId,tx=>tx.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:cmd.organizationId,commandId:cmd.commandId}}}));if(prior)return prior.response;
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${cmd.organizationId}, true)`;
   const objective=await tx.marketingObjective.findFirst({where:{id:cmd.objectiveId,organizationId:cmd.organizationId}});if(!objective)throw new NotFoundException('Objective not found in tenant');
   if(cmd.productId){const p=await tx.marketingProduct.findFirst({where:{id:cmd.productId,organizationId:cmd.organizationId}});if(!p)throw new NotFoundException('Product not found in tenant')}
   if(cmd.brandId){const b=await tx.brand.findFirst({where:{organizationId:cmd.organizationId,id:cmd.brandId,status:'ACTIVE'}});if(!b)throw new NotFoundException('Active campaign brand not found in tenant')}
   const dup=await tx.campaign.findUnique({where:{organizationId_code:{organizationId:cmd.organizationId,code:cmd.code}}});if(dup)throw new ConflictException('Campaign code already exists');
   const c=await tx.campaign.create({data:{organizationId:cmd.organizationId,code:cmd.code,name:cmd.name,objectiveId:cmd.objectiveId,...(cmd.brandId ? {brandId:cmd.brandId}:{}),...(cmd.productId ? {productId:cmd.productId} : {}),riskLevel:cmd.riskLevel,status:'IDEA'}});
   const response={campaignId:c.id,status:c.status,version:c.version};
   await tx.commandReceipt.create({data:{organizationId:cmd.organizationId,commandId:cmd.commandId,commandType:'CreateCampaign',correlationId:cmd.correlationId,status:'COMPLETED',response}});
   await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:actorId?'HUMAN':'AGENT',actorId:actorId??'MKT-OPS-001',action:'CAMPAIGN_CREATED',objectType:'Campaign',objectId:c.id,after:c as any,correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {})}});
   await this.outbox.enqueue(tx,{organizationId:cmd.organizationId,eventId:randomUUID(),eventType:'CampaignCreated',aggregateType:'Campaign',aggregateId:c.id,payload:{campaignId:c.id,code:c.code,status:c.status},correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {})});
   return response;
  });
 }
 async transition(cmd:TransitionCampaignCommand,actorId?:string){
  const prior=await withMarketingTenant(this.db,cmd.organizationId,tx=>tx.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:cmd.organizationId,commandId:cmd.commandId}}}));if(prior)return prior.response;
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${cmd.organizationId}, true)`;
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
   await tx.auditEvent.create({data:{organizationId:cmd.organizationId,actorType:actorId?'HUMAN':'AGENT',actorId:actorId??'MKT-OPS-001',action:'CAMPAIGN_STATUS_CHANGED',objectType:'Campaign',objectId:c.id,before:{status:c.status,version:c.version},after:{status:next.status,version:next.version},correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {})}});
   await this.outbox.enqueue(tx,{organizationId:cmd.organizationId,eventId:randomUUID(),eventType:'CampaignStatusChanged',aggregateType:'Campaign',aggregateId:c.id,payload:{campaignId:c.id,from:c.status,to:next.status,version:next.version},correlationId:cmd.correlationId,...(cmd.causationId ? {causationId:cmd.causationId} : {}),version:next.version});
   return response;
  });
 }
}