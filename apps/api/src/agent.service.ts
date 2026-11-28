import {validateAgentInput} from '@medsol/agent-runtime';
import {agentReleaseDigest,agentReleaseTrustConfig,baselineAgentReleaseManifest,
 parseAgentReleaseManifest,verifyTrustedAgentReleaseSignature}
 from './agent-manifest-release.js';
import {BadRequestException,ConflictException,NotFoundException,ForbiddenException,Injectable,Optional} from '@nestjs/common'; import {GovernedModelService} from './governed-model.service.js'; import {AgentRegistry,AgentRuntime,AGENT_ROSTER,MarketingDomainAgent} from '@medsol/agent-runtime'; import {PrismaService,withMarketingTenant} from './prisma.service.js'; import {randomUUID} from 'node:crypto';
import type {VerifiedIdentity} from './oidc-identity.js';
import type {Prisma} from '@prisma/client';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {SPECIALIST_REHEARSAL,rehearsalInput,rehearsalId,rehearsalScope,rehearsalDigest,readRehearsal,currentSpecialistTemplate,validateRehearsal,loadHandoverPin,handoverTuple,type HandoverPin} from './offline-specialist-rehearsal.js';
import {lockSpecialist,readSpecialist,SPECIALIST_REGISTRATION} from './offline-specialist.js';
import {SPECIALIST_BRAIN_MODE,specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
import {SPECIALIST_DECISION_MODE,specialistDecision} from './specialist-decision-brain.js';
import {REASONING_EVALUATION_MODE,evaluateSpecialistReasoning} from './specialist-reasoning-evaluation.js';
import {STRUCTURED_DRAFT_MODE,prepareStructuredDraftFixture,structuredDraftFixture,structuredDraftFixtureReceipt} from './specialist-structured-model-draft.js';
import {SPECIALIST_OUTPUT_REVIEW,outputReviewId,outputReviewScope,readOutputReview} from './specialist-output-review.js';
import {configPinTuple,type ConfigPin} from './offline-specialist-config.js';
import {MarketingLearningService} from './marketing-learning.service.js';
import {loadSpecialistContextPin,contextPinTuple} from './specialist-context-pin.js';
import {parseSpecialistBatch,dispatchSpecialistBatch} from './specialist-batch-dispatch.js';
import {parseDurableBatch,batchCommandId,durableBatchState,reconstructDurableBatch,durableBatchView,DURABLE_SPECIALIST_BATCH,DURABLE_SPECIALIST_STAGE,batchStageId} from './specialist-durable-dispatch.js';
import {SPECIALIST_SCHEDULE,SPECIALIST_SCHEDULE_EVENT,specialistScheduleConfigured,scheduleCommandId,makeScheduleGrant,readScheduleGrant,reconstructSchedule,scheduleEvent,type ScheduleEventStatus,type ScheduleGrant} from './specialist-schedule.js';
import {allocationInput,rankSpecialists,allocationRequestInput,allocationPreviewDigest,allocationRequestDigest,type AllocationInput,type AllocationCandidate} from './specialist-allocation.js';
@Injectable() export class AgentService{
 private readonly registry=new AgentRegistry();private readonly runtime:AgentRuntime;
 constructor(private readonly db:PrismaService,@Optional() private readonly model?:GovernedModelService,@Optional() private readonly learning?:MarketingLearningService){for(const manifest of AGENT_ROSTER)this.registry.register(new MarketingDomainAgent(manifest));this.runtime=new AgentRuntime(this.registry)}
 async previewSpecialistAllocation(identity:VerifiedIdentity,raw:unknown){
  const input=allocationInput(raw),org=identity.organizationId;
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await lockSpecialist(tx,org);
   return this.allocateSpecialists(tx,identity,input);
  });
 }
 private async allocateSpecialists(tx:Prisma.TransactionClient,identity:VerifiedIdentity,input:AllocationInput){
   const org=identity.organizationId;
   if(!this.learning)throw new ConflictException('Canonical knowledge fabric unavailable');
   const candidates:AllocationCandidate[]=[],pins:unknown[]=[];
   for(const agentId of input.candidateIds){
    const template=await currentSpecialistTemplate(tx,org,agentId);
    const reg=await tx.approval.findFirst({where:{organizationId:org,id:template.registrationId,objectType:SPECIALIST_REGISTRATION,objectId:agentId,decision:'APPROVED'}});
    if(!reg||reg.scopeDigest!==template.registrationDigest)throw new ConflictException('Specialist registration changed');
    const observed=await this.learning.contextForAgent(org,agentId,input.contextQuery,tx);
    const pin=observed.results.length||observed.memories.length?await loadSpecialistContextPin(this.learning,tx,org,agentId,input.contextQuery):undefined;
    pins.push([agentId,template,pin?contextPinTuple(pin):null]);
    candidates.push({agentId,mission:template.configuration?.mission??readSpecialist(reg).input.mission,capability:template.capability,configurationVersion:template.configuration?.version??0,maxObjectiveChars:template.configuration?.maxObjectiveChars??500,skills:template.configuration?.reviewSkills??[],referenceCount:pin?.references.length??0});
   }
   const result=rankSpecialists(input,candidates);
   return{...result,previewDigest:allocationPreviewDigest(org,identity.userId,input,result,pins)};
 }
 async requestSpecialistRehearsal(identity:VerifiedIdentity,raw:unknown){
  const input=rehearsalInput(raw),org=identity.organizationId;
  if(input.allocationRequestDigest!==undefined)throw new BadRequestException('Allocation origin is server-derived');
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await lockSpecialist(tx,org);
   return this.persistSpecialistRehearsal(tx,identity,input);
  });
 }
 async requestAllocatedSpecialistRehearsal(identity:VerifiedIdentity,raw:unknown){
  const command=allocationRequestInput(raw),org=identity.organizationId;
  const input=rehearsalInput({agentId:command.expectedAgentId,requestKey:command.requestKey,objective:command.allocation.objective,market:command.allocation.market,contextQuery:command.allocation.contextQuery,fixtureOnly:true,brainMode:SPECIALIST_DECISION_MODE,allocationRequestDigest:allocationRequestDigest(org,identity.userId,command)});
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await lockSpecialist(tx,org);
   const prior=await tx.approval.findFirst({where:{organizationId:org,id:rehearsalId(org,input.requestKey)}});
   if(prior)return this.persistSpecialistRehearsal(tx,identity,input);
   const preview=await this.allocateSpecialists(tx,identity,command.allocation);
   if(preview.previewDigest!==command.expectedPreviewDigest||preview.recommendedAgentId!==input.agentId)throw new ConflictException('Allocation preview changed; review current candidates again');
   return this.persistSpecialistRehearsal(tx,identity,input);
  });
 }
 private async persistSpecialistRehearsal(tx:Prisma.TransactionClient,identity:VerifiedIdentity,input:ReturnType<typeof rehearsalInput>){
   const org=identity.organizationId,id=rehearsalId(org,input.requestKey);
   const prior=await tx.approval.findFirst({where:{organizationId:org,id}});
   if(prior){
    const scope=readRehearsal(prior);
    if(scope.requestedBy!==identity.userId||JSON.stringify(scope.input)!==JSON.stringify(input))throw new ConflictException('Immutable specialist rehearsal key already used');
    return{approvalId:id,decision:prior.decision,...scope,replayed:true};
   }
   const template=await currentSpecialistTemplate(tx,org,input.agentId);
   const contextPin=input.contextQuery!==undefined?await loadSpecialistContextPin(this.learning,tx,org,input.agentId,input.contextQuery):undefined;
   const handover=input.handoverApprovalId!==undefined?await loadHandoverPin(tx,org,identity.userId,input.agentId,input.handoverApprovalId,new Date(),this.learning):undefined;
   const scope=rehearsalScope(org,identity.userId,input,template,new Date(Date.now()+86400000).toISOString(),contextPin,handover);
   await tx.approval.create({data:{id,organizationId:org,objectType:SPECIALIST_REHEARSAL,objectId:input.agentId,
    requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R3',requestedBy:identity.userId,scope,scopeDigest:rehearsalDigest(scope),
    scopeExpiresAt:new Date(scope.expiresAt)}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_REHEARSAL_REQUESTED',objectType:'Agent',objectId:input.agentId,correlationId:id,after:{scopeDigest:rehearsalDigest(scope),externalEffectsAuthorized:false}}});
   return{approvalId:id,decision:'PENDING',...scope,replayed:false};
 }
 async executeSpecialistBatch(identity:VerifiedIdentity,raw:unknown){
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.hasOwn(raw,'action'))return this.coordinateSpecialistBatch(identity,raw);
  const batch=parseSpecialistBatch(raw),org=identity.organizationId;
  if(process.env.MARKETING_AI_REASONING_ENABLED==='true')throw new ForbiddenException('Specialist batch requires offline reasoning');
  await withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await this.specialistBatchPins(tx,identity,batch.approvalIds);
  });
  return dispatchSpecialistBatch(batch.approvalIds,id=>this.executeSpecialistRehearsal(identity,{approvalId:id,fixtureOnly:true}));
 }
 private async specialistBatchPins(tx:Prisma.TransactionClient,identity:VerifiedIdentity,ids:string[]){
   const org=identity.organizationId;
   const rows=await tx.approval.findMany({where:{organizationId:org,objectType:SPECIALIST_REHEARSAL,id:{in:ids}}});
   if(rows.length!==ids.length)throw new ConflictException('All batch approvals must be present in tenant');
   const agents=new Set<string>(),pins:string[]=[];
   for(const id of ids){
    const a=rows.find(row=>row.id===id)!;
    const s=readRehearsal(a);
    if(a.requestedBy!==identity.userId||a.decision!=='APPROVED'||!a.decidedBy||a.decidedBy===a.requestedBy||!a.decidedAt||!a.scopeExpiresAt||a.decidedAt>=a.scopeExpiresAt||s.input.brainMode!==SPECIALIST_DECISION_MODE||agents.has(a.objectId))
     throw new ConflictException('Batch requires distinct specialists and exact independent operator approvals');
    if(!a.scopeDigest)throw new ConflictException('Missing exact batch scope digest');
    agents.add(a.objectId);pins.push(a.scopeDigest);
    // No new execution rights are granted. Current scope and reviewer are
    // rechecked by the canonical execution method at each dispatch.
   }
   return pins;
 }
 async coordinateSpecialistBatch(identity:VerifiedIdentity,raw:unknown){
  return this.coordinateBatch(identity,raw);
 }
 private async coordinateBatch(identity:VerifiedIdentity,raw:unknown,scheduledDigest?:string){
  const cmd=parseDurableBatch(raw),org=identity.organizationId,commandId=batchCommandId(cmd.requestKey);
  if(process.env.MARKETING_AI_REASONING_ENABLED==='true')throw new ForbiddenException('Specialist batch requires offline reasoning');
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${org+':'+commandId})::bigint)::text AS lock_result`;
   const prior=await tx.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:org,commandId}}});
   if(!prior){
    if(cmd.action!=='CREATE')throw new NotFoundException('Durable specialist batch not found');
    const pins=await this.specialistBatchPins(tx,identity,cmd.approvalIds);
    const state=durableBatchState(org,identity.userId,cmd.requestKey,cmd.approvalIds,pins);
    const view=durableBatchView(state);
    await tx.commandReceipt.create({data:{organizationId:org,commandId,commandType:DURABLE_SPECIALIST_BATCH,correlationId:commandId,status:view.status,response:state}});
    await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_BATCH_REGISTERED',objectType:'CommandReceipt',objectId:commandId,correlationId:commandId,after:{planDigest:state.planDigest,externalEffectsAuthorized:false}}});
    return{...view,advanced:false};
   }
   if(prior.commandType!==DURABLE_SPECIALIST_BATCH||prior.correlationId!==commandId)throw new ConflictException('Invalid durable command receipt');
   if(prior.status!=='REGISTERED')throw new ConflictException('Immutable batch root status mismatch');
   const stageRows=await tx.commandReceipt.findMany({where:{organizationId:org,correlationId:commandId,commandType:DURABLE_SPECIALIST_STAGE},take:5});
   const state=reconstructDurableBatch(prior.response,stageRows,org,identity.userId,cmd.requestKey),view=durableBatchView(state);
   const scheduleId=scheduleCommandId(cmd.requestKey);
   const schedule=await this.readSchedule(tx,org,cmd.requestKey),grant=schedule?.grant;
   if(grant&&(grant.owner!==identity.userId||grant.planDigest!==state.planDigest||grant.initialCursor>view.cursor))throw new ConflictException('Schedule does not match durable batch');
   if(schedule&&['ACTIVE','CLAIMED','NEEDS_INTERVENTION'].includes(schedule.status)&&schedule.cursor!==view.cursor)throw new ConflictException('Schedule cursor does not match durable batch');
   const scheduleView=()=>({schedulerConfigured:specialistScheduleConfigured(),scheduleStatus:schedule?.status??null,scheduleExpiresAt:grant?.expiresAt??null});
   if(scheduledDigest!==undefined&&(!specialistScheduleConfigured()||cmd.action!=='ADVANCE'||schedule?.status!=='CLAIMED'||grant?.digest!==scheduledDigest||Date.parse(grant.expiresAt)<=Date.now()||schedule.cursor!==cmd.expectedCursor))throw new ConflictException('Current claimed schedule grant required');
   if(cmd.action==='CREATE'&&JSON.stringify(cmd.approvalIds)!==JSON.stringify(state.approvalIds))throw new ConflictException('Immutable batch key already used');
   const pins=await this.specialistBatchPins(tx,identity,state.approvalIds);
   if(JSON.stringify(pins)!==JSON.stringify(state.scopeDigests))throw new ConflictException('Durable batch approval scope changed');
   // Verify completed prefix using authoritative execution records; no duplicated decisions.
   for(const stage of state.stages){
    const existing=await tx.agentExecution.findFirst({where:{organizationId:org,id:stage.executionId,correlationId:stage.approvalId}});
    if(!existing||existing.status!==stage.status)throw new ConflictException('Durable batch execution receipt missing or changed');
    const replay=await this.executeSpecialistInTransaction(tx,identity,stage.approvalId);
    if(!replay.replayed||replay.executionId!==stage.executionId||replay.status!==stage.status)throw new ConflictException('Durable batch replay mismatch');
   }
   if(cmd.action==='SCHEDULE'){
    if(!specialistScheduleConfigured()||!view.nextApprovalId||cmd.expectedCursor!==view.cursor)throw new ConflictException('Explicit enabled scheduler and current incomplete batch required');
    if(schedule)throw new ConflictException('A schedule already exists; use manual recovery after cancellation or intervention');
    const newGrant=makeScheduleGrant(org,identity.userId,cmd.requestKey,state.planDigest,view.cursor,new Date());
    await tx.commandReceipt.create({data:{organizationId:org,commandId:scheduleId,commandType:SPECIALIST_SCHEDULE,correlationId:commandId,status:'ACTIVE',response:newGrant}});
    await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_BATCH_SCHEDULED',objectType:'CommandReceipt',objectId:scheduleId,correlationId:commandId,after:{grantDigest:newGrant.digest,expiresAt:newGrant.expiresAt,externalEffectsAuthorized:false}}});
    return{...view,advanced:false,schedulerConfigured:true,scheduleStatus:'ACTIVE',scheduleExpiresAt:newGrant.expiresAt};
   }
   if(cmd.action==='CANCEL_SCHEDULE'){
    if(!schedule||!['ACTIVE','CLAIMED','NEEDS_INTERVENTION'].includes(schedule.status))throw new ConflictException('No cancellable schedule');
    await this.appendScheduleEvent(tx,org,schedule.grant,'CANCELLED',schedule.cursor);
    await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_BATCH_SCHEDULE_CANCELLED',objectType:'CommandReceipt',objectId:scheduleId,correlationId:commandId,after:{externalEffectsAuthorized:false}}});
    return{...view,advanced:false,...scheduleView(),scheduleStatus:'CANCELLED'};
   }
   if(cmd.action!=='ADVANCE')return{...view,advanced:false,...scheduleView()};
   if(scheduledDigest===undefined&&schedule&&['ACTIVE','CLAIMED','NEEDS_INTERVENTION'].includes(schedule.status))throw new ConflictException('Cancel schedule before manual advancement');
   if(cmd.expectedCursor>view.cursor)throw new ConflictException('Durable batch cursor mismatch');
   if(cmd.expectedCursor<view.cursor||!view.nextApprovalId){if(scheduledDigest!==undefined)throw new ConflictException('Scheduled cursor no longer current');return{...view,advanced:false,...scheduleView()};}
   const result=await this.executeSpecialistInTransaction(tx,identity,view.nextApprovalId,scheduledDigest);
   if(result.status!=='COMPLETED'&&result.status!=='BLOCKED')throw new ConflictException('Invalid durable batch stage result');
   state.stages.push({approvalId:view.nextApprovalId,executionId:result.executionId,status:result.status});
   const updated=durableBatchView(state);
   await tx.commandReceipt.create({data:{organizationId:org,commandId:batchStageId(cmd.requestKey,view.cursor),commandType:DURABLE_SPECIALIST_STAGE,correlationId:commandId,status:result.status,response:{schema:'medsol.specialist-batch-stage.v1',planDigest:state.planDigest,index:view.cursor,stage:state.stages[view.cursor]!}}});
   const scheduleStatus=scheduledDigest!==undefined?(updated.status==='COMPLETED'?'COMPLETED':updated.status==='HALTED'?'HALTED':'ACTIVE'):schedule?.status??null;
   if(scheduledDigest!==undefined){if(!grant)throw new ConflictException('Missing schedule grant');await this.appendScheduleEvent(tx,org,grant,updated.status==='COMPLETED'?'COMPLETED':updated.status==='HALTED'?'HALTED':'ADVANCED',view.cursor);}
   await tx.auditEvent.create({data:{organizationId:org,actorType:scheduledDigest?'SYSTEM':'HUMAN',actorId:scheduledDigest?'SPECIALIST_SCHEDULER':identity.userId,action:'OFFLINE_SPECIALIST_BATCH_ADVANCED',objectType:'CommandReceipt',objectId:commandId,correlationId:commandId,after:{planDigest:state.planDigest,cursor:updated.cursor,stageStatus:result.status,...(scheduledDigest?{scheduleGrantDigest:scheduledDigest,delegatedBy:identity.userId}:{}),externalEffectsAuthorized:false}}});
   return{...updated,advanced:true,...scheduleView(),scheduleStatus};
  });
 }
 private async readSchedule(tx:Prisma.TransactionClient,org:string,key:string){
  const commandId=scheduleCommandId(key);
  const root=await tx.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:org,commandId}}});
  if(!root)return undefined;
  if(root.commandType!==SPECIALIST_SCHEDULE||root.correlationId!==batchCommandId(key)||root.status!=='ACTIVE')throw new ConflictException('Invalid immutable schedule root');
  const grant=readScheduleGrant(root.response,org,key);
  const rows=await tx.commandReceipt.findMany({where:{organizationId:org,commandType:SPECIALIST_SCHEDULE_EVENT,correlationId:commandId},take:10});
  return reconstructSchedule(grant,rows,new Date());
 }
 private async appendScheduleEvent(tx:Prisma.TransactionClient,org:string,grant:ScheduleGrant,status:ScheduleEventStatus,cursor:number){
  await tx.commandReceipt.create({data:{organizationId:org,...scheduleEvent(grant,status,cursor)}});
 }
 /** Internal worker only. Both the plan and the schedule ledger are append-only.
  * A claim is committed before execution; an unmatched claim is never retried.
  * The existing tenant-scoped coordinator commits stage and outcome together.
  */
 async runDueSpecialistSchedule(org:string){
  if(!specialistScheduleConfigured())return{status:'DISABLED'};
  const claim=await withMarketingTenant(this.db,org,async tx=>{
   const now=new Date().toISOString();
   const eligible=await tx.$queryRaw<Array<{commandId:string}>>`
    SELECT r."commandId" FROM "CommandReceipt" r
    WHERE r."organizationId"=${org} AND r."commandType"=${SPECIALIST_SCHEDULE} AND r.status='ACTIVE'
     AND r.response->>'expiresAt'>${now}
     AND NOT EXISTS (SELECT 1 FROM "CommandReceipt" e WHERE e."organizationId"=r."organizationId" AND e."correlationId"=r."commandId" AND e."commandType"=${SPECIALIST_SCHEDULE_EVENT} AND e.status IN ('COMPLETED','HALTED','NEEDS_INTERVENTION','CANCELLED'))
     AND NOT EXISTS (SELECT 1 FROM "CommandReceipt" c WHERE c."organizationId"=r."organizationId" AND c."correlationId"=r."commandId" AND c."commandType"=${SPECIALIST_SCHEDULE_EVENT} AND c.status='CLAIMED'
      AND NOT EXISTS (SELECT 1 FROM "CommandReceipt" o WHERE o."organizationId"=c."organizationId" AND o."correlationId"=c."correlationId" AND o."commandType"=${SPECIALIST_SCHEDULE_EVENT} AND o."commandId"=replace(c."commandId",':claim:',':outcome:')))
    ORDER BY r."createdAt",r.id LIMIT 1`;
   const next=eligible[0];if(!next)return null;
   const key=next.commandId.slice(SPECIALIST_SCHEDULE.length+1);
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${org+':'+batchCommandId(key)})::bigint)::text AS lock_result`;
   const schedule=await this.readSchedule(tx,org,key);
   if(!schedule||schedule.status!=='ACTIVE')return null;
   const g=schedule.grant,commandId=batchCommandId(key);
   const batch=await tx.commandReceipt.findUnique({where:{organizationId_commandId:{organizationId:org,commandId}}});
   if(!batch||batch.commandType!==DURABLE_SPECIALIST_BATCH||batch.status!=='REGISTERED')throw new ConflictException('Scheduled batch missing');
   const stages=await tx.commandReceipt.findMany({where:{organizationId:org,correlationId:commandId,commandType:DURABLE_SPECIALIST_STAGE},take:5});
   const state=reconstructDurableBatch(batch.response,stages,org,g.owner,key),view=durableBatchView(state);
   if(g.planDigest!==state.planDigest||schedule.cursor!==view.cursor||!view.nextApprovalId)throw new ConflictException('Scheduled plan no longer eligible');
   const user=await tx.user.findFirst({where:{organizationId:org,id:g.owner,disabledAt:null},select:{id:true,oidcSubject:true,role:true,email:true}});
   await this.appendScheduleEvent(tx,org,g,'CLAIMED',view.cursor);
   await tx.auditEvent.create({data:{organizationId:org,actorType:'SYSTEM',actorId:'SPECIALIST_SCHEDULER',action:'OFFLINE_SPECIALIST_BATCH_SCHEDULE_CLAIMED',objectType:'CommandReceipt',objectId:next.commandId,correlationId:commandId,after:{grantDigest:g.digest,cursor:view.cursor,delegatedBy:g.owner,externalEffectsAuthorized:false}}});
   return{key,grant:g,cursor:view.cursor,user};
  });
  if(!claim)return{status:'EMPTY_OR_CLAIMED'};
  try{
   if(!claim.user?.oidcSubject)throw new ForbiddenException('Current schedule owner required');
   // Reconstruct only a current delegated owner authorization descriptor from
   // canonical IAM; never create or claim a human login/session.
   const identity:VerifiedIdentity={organizationId:org,userId:claim.user.id,subject:claim.user.oidcSubject,role:claim.user.role,email:claim.user.email};
   const result=await this.coordinateBatch(identity,{action:'ADVANCE',requestKey:claim.key,expectedCursor:claim.cursor,fixtureOnly:true},claim.grant.digest);
   return{status:result.status};
  }catch{
   await withMarketingTenant(this.db,org,async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${org+':'+batchCommandId(claim.key)})::bigint)::text AS lock_result`;
    const schedule=await this.readSchedule(tx,org,claim.key);
    if(schedule?.status==='CLAIMED'&&schedule.cursor===claim.cursor&&schedule.grant.digest===claim.grant.digest){
     await this.appendScheduleEvent(tx,org,claim.grant,'NEEDS_INTERVENTION',claim.cursor);
     await tx.auditEvent.create({data:{organizationId:org,actorType:'SYSTEM',actorId:'SPECIALIST_SCHEDULER',action:'OFFLINE_SPECIALIST_BATCH_SCHEDULE_HALTED',objectType:'CommandReceipt',objectId:scheduleCommandId(claim.key),correlationId:batchCommandId(claim.key),after:{grantDigest:claim.grant.digest,cursor:claim.cursor,externalEffectsAuthorized:false}}});
    }
   });
   return{status:'NEEDS_INTERVENTION'};
  }
 }
 async executeSpecialistRehearsal(identity:VerifiedIdentity,raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='approvalId,fixtureOnly')throw new BadRequestException('Exact approved rehearsal reference required');
  const v=raw as {approvalId?:unknown;fixtureOnly?:unknown};
  if(v.fixtureOnly!==true||typeof v.approvalId!=='string'||!/^specialist-run-[0-9a-f]{64}$/.test(v.approvalId))throw new BadRequestException('Invalid rehearsal reference');
  if(process.env.MARKETING_AI_REASONING_ENABLED==='true')throw new ForbiddenException('Specialist rehearsal requires offline reasoning');
  return withMarketingTenant(this.db,identity.organizationId,tx=>this.executeSpecialistInTransaction(tx,identity,v.approvalId as string));
 }
 private async executeSpecialistInTransaction(tx:Prisma.TransactionClient,identity:VerifiedIdentity,id:string,scheduledDigest?:string){
   const org=identity.organizationId,executionId=id+'-execution';
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await tx.$queryRaw`SELECT "id" FROM "Approval" WHERE "organizationId"=${org} AND "id"=${id} FOR UPDATE`;
   const a=await tx.approval.findFirst({where:{organizationId:org,id,objectType:SPECIALIST_REHEARSAL}});
   if(!a)throw new NotFoundException('Specialist rehearsal not found in tenant');
   const scope=readRehearsal(a);
   if(scope.requestedBy!==identity.userId)throw new ForbiddenException('Only the original reviewed rehearsal operator may execute');
   if(a.decision!=='APPROVED'||!a.decidedBy||a.decidedBy===a.requestedBy||!a.decidedAt||!a.scopeExpiresAt||a.decidedAt>=a.scopeExpiresAt)throw new ConflictException('Independent exact rehearsal approval required');
   const prior=await tx.agentExecution.findFirst({where:{organizationId:org,id:executionId}});
   if(prior){
    if(prior.agentId!==scope.input.agentId||prior.correlationId!==id||!['COMPLETED','BLOCKED'].includes(prior.status))throw new ConflictException('Invalid historical specialist execution');
    const d=prior.decision as Record<string,unknown>|null;
    if(!d||d.schema!=='medsol.specialist-rehearsal-result.v1'||d.approvalId!==id||d.scopeDigest!==a.scopeDigest||
     d.agentId!==scope.input.agentId||d.templateAgentId!==scope.templateId||d.templateDigest!==scope.templateDigest||
     d.fixtureOnly!==true||d.outputHumanApproved!==false||d.autonomousExecutionAuthorized!==false||d.modelCallsAuthorized!==false||
     d.toolCallsAuthorized!==false||d.memoryWritesAuthorized!==false||d.externalEffectsAuthorized!==false)
     throw new ConflictException('Historical specialist execution provenance invalid');
    if(scope.contextPin&&JSON.stringify(d.contextEvidence)!==JSON.stringify({pin:scope.contextPin,independentlyVerified:false,sourceTextCopied:false})){
     // JSONB property order is not authoritative. Normalize the tuple before comparison.
     const ev=d.contextEvidence as {pin?:typeof scope.contextPin;independentlyVerified?:unknown;sourceTextCopied?:unknown}|undefined;
     if(!ev?.pin||ev.independentlyVerified!==false||ev.sourceTextCopied!==false||JSON.stringify(contextPinTuple(ev.pin))!==JSON.stringify(contextPinTuple(scope.contextPin)))throw new ConflictException('Historical specialist context evidence invalid');
    }
    if(scope.handover){if(!d.handover||JSON.stringify(handoverTuple(d.handover as HandoverPin))!==JSON.stringify(handoverTuple(scope.handover)))throw new ConflictException('Historical specialist handover invalid');}
    else if(d.handover!==undefined)throw new ConflictException('Unexpected historical specialist handover');
    if(scope.configuration){if(!d.configuration||JSON.stringify(configPinTuple(d.configuration as ConfigPin))!==JSON.stringify(configPinTuple(scope.configuration)))throw new ConflictException('Historical specialist configuration evidence invalid');}
    else if(d.configuration!==undefined)throw new ConflictException('Unexpected historical specialist configuration');
    if(scope.input.brainMode===SPECIALIST_BRAIN_MODE||scope.input.brainMode===SPECIALIST_DECISION_MODE){
     const plan=d.missionPlan as Record<string,unknown>|undefined;
     if(!plan||plan.mode!==SPECIALIST_BRAIN_MODE||plan.humanReviewRequired!==true||plan.scientificVerification!==false||plan.externalEffectsAuthorized!==false||plan.modelCallsAuthorized!==false||plan.toolCallsAuthorized!==false||plan.memoryWritesAuthorized!==false||plan.autonomousExecutionAuthorized!==false||specialistPlanDigest(plan)!==d.missionPlanDigest)throw new ConflictException('Historical specialist mission plan invalid');
    }else if(d.missionPlan!==undefined||d.missionPlanDigest!==undefined)throw new ConflictException('Unexpected historical specialist mission plan');
    if(scope.input.brainMode===SPECIALIST_DECISION_MODE){
     const template=d.templateDecision as {executionAllowed?:unknown}|undefined;
     if(typeof template?.executionAllowed!=='boolean'||!d.specialistDecision||!d.missionPlan)throw new ConflictException('Historical specialist decision missing');
     const expected=specialistDecision(d.missionPlan as ReturnType<typeof specialistMissionPlan>,template.executionAllowed);
     if(specialistPlanDigest(expected)!==d.specialistDecisionDigest||specialistPlanDigest(d.specialistDecision)!==d.specialistDecisionDigest||prior.status!==(expected.draftEligible?'COMPLETED':'BLOCKED'))throw new ConflictException('Historical specialist decision integrity invalid');
    }else if(d.specialistDecision!==undefined||d.specialistDecisionDigest!==undefined)throw new ConflictException('Unexpected historical specialist decision');
    if(scope.input.simulationMode==='PROVIDER_CONTRACT_V1'&&prior.status==='COMPLETED'){
     const contracts=d.providerContracts as {schema?:unknown;decisionDigest?:unknown;results?:{providerKey?:unknown;model?:unknown;inputTokens?:unknown;outputTokens?:unknown;actualCostMicros?:unknown;passed?:unknown}[];providerRequestsMade?:unknown;realModelInvocations?:unknown;actualCostMicros?:unknown;modelQualityEvaluated?:unknown;externalEffectsAuthorized?:unknown}|undefined;
     const keys=['OPENAI','ANTHROPIC','GEMINI','LOCAL'];
     if(!contracts||contracts.schema!=='medsol.specialist-provider-contracts.v1'||contracts.decisionDigest!==d.specialistDecisionDigest||contracts.providerRequestsMade!==0||contracts.realModelInvocations!==0||contracts.actualCostMicros!==0||contracts.modelQualityEvaluated!==false||contracts.externalEffectsAuthorized!==false||!Array.isArray(contracts.results)||contracts.results.length!==4||contracts.results.some((r,i)=>r.providerKey!==keys[i]||r.model!=='synthetic:'+keys[i]!.toLowerCase()||r.actualCostMicros!==0||r.passed!==true||typeof r.inputTokens!=='number'||!Number.isSafeInteger(r.inputTokens)||r.inputTokens<0||typeof r.outputTokens!=='number'||!Number.isSafeInteger(r.outputTokens)||r.outputTokens<0||r.outputTokens>256)||specialistPlanDigest(contracts)!==d.providerContractsDigest)throw new ConflictException('Historical synthetic provider contracts invalid');
    }else if(d.providerContracts!==undefined||d.providerContractsDigest!==undefined)throw new ConflictException('Unexpected historical provider contracts');
    if(scope.input.evaluationMode===REASONING_EVALUATION_MODE){
     if(!d.missionPlan||!d.specialistDecision||!d.reasoningEvaluation)throw new ConflictException('Historical decision evaluation missing');
     const expected=evaluateSpecialistReasoning(d.missionPlan as ReturnType<typeof specialistMissionPlan>,d.specialistDecision as ReturnType<typeof specialistDecision>,scope.contextPin);
     if(specialistPlanDigest(expected)!==d.reasoningEvaluationDigest||specialistPlanDigest(d.reasoningEvaluation)!==d.reasoningEvaluationDigest)throw new ConflictException('Historical decision evaluation integrity invalid');
    }else if(d.reasoningEvaluation!==undefined||d.reasoningEvaluationDigest!==undefined)throw new ConflictException('Unexpected historical decision evaluation');
    if(scope.input.structuredDraftMode===STRUCTURED_DRAFT_MODE&&prior.status==='COMPLETED'){
     if(!scope.contextPin||!d.missionPlan||!d.specialistDecision||!a.scopeDigest||!d.structuredDraft)throw new ConflictException('Historical structured draft fixture missing');
     const prepared=prepareStructuredDraftFixture({organizationId:org,approvalId:id,scopeDigest:a.scopeDigest,templateAgentId:scope.templateId,plan:d.missionPlan as ReturnType<typeof specialistMissionPlan>,decision:d.specialistDecision as ReturnType<typeof specialistDecision>,contextPin:scope.contextPin});
     const expected=structuredDraftFixtureReceipt(prepared,structuredDraftFixture(prepared));
     if(specialistPlanDigest(expected)!==d.structuredDraftDigest||specialistPlanDigest(d.structuredDraft)!==d.structuredDraftDigest)throw new ConflictException('Historical structured draft integrity invalid');
     const reviewId=outputReviewId(org,id);
     const outputReview=await tx.approval.findFirst({where:{organizationId:org,id:reviewId,objectType:SPECIALIST_OUTPUT_REVIEW}});
     if(!outputReview||d.outputReviewId!==reviewId)throw new ConflictException('Historical output review missing');
     const reviewScope=readOutputReview(outputReview);
     if(reviewScope.sourceScopeDigest!==a.scopeDigest||reviewScope.structuredDraftDigest!==d.structuredDraftDigest||specialistPlanDigest(reviewScope.draft)!==specialistPlanDigest(expected.draft))throw new ConflictException('Historical output review integrity invalid');
    }else if(d.structuredDraft!==undefined||d.structuredDraftDigest!==undefined||d.outputReviewId!==undefined)throw new ConflictException('Unexpected historical structured draft');
    return{executionId,status:prior.status,decision:prior.decision,replayed:true,externalEffectsAuthorized:false};
   }
   await validateRehearsal(tx,a,new Date(),this.learning);
   const reviewer=await tx.user.findFirst({where:{organizationId:org,id:a.decidedBy,disabledAt:null},select:{id:true,email:true,role:true,oidcSubject:true}});
   if(!reviewer?.oidcSubject)throw new ForbiddenException('Current independent reviewer required');
   const reviewerIdentity={organizationId:org,userId:reviewer.id,email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject};
   await assertActorPermissionInTenantTransaction(tx,reviewerIdentity,'MANAGE_TENANT');
   await assertActorPermissionInTenantTransaction(tx,reviewerIdentity,'DECIDE_APPROVAL');
   const input={objective:scope.input.objective,market:scope.input.market,fixtureOnly:true,...(scope.contextPin?{evidenceReferences:scope.contextPin.references.map(r=>r.citationRef)}:{})};
   validateAgentInput(input,scope.maxInputBytes);
   // Invoke only the existing deterministic runtime's canonical template,
   // never its governed model gateway. This is an explicit rehearsal of a
   // paused specialist, not general activation or a second engine.
   const templateDecision=await this.runtime.execute(scope.templateId,{executionId,organizationId:org,correlationId:id,input,capabilities:[scope.capability]});
   let missionPlan:ReturnType<typeof specialistMissionPlan>|undefined;
   if(scope.input.brainMode===SPECIALIST_BRAIN_MODE||scope.input.brainMode===SPECIALIST_DECISION_MODE){
    const registration=await tx.approval.findFirst({where:{organizationId:org,id:scope.registrationId,objectType:SPECIALIST_REGISTRATION,objectId:scope.input.agentId,decision:'APPROVED'}});
    if(!registration||registration.scopeDigest!==scope.registrationDigest)throw new ConflictException('Specialist mission registration changed');
    const registered=readSpecialist(registration);
    missionPlan=specialistMissionPlan({mission:scope.configuration?.mission??registered.input.mission,objective:scope.input.objective,market:scope.input.market,capability:scope.capability,references:scope.contextPin?.references.map(r=>r.citationRef)??[],...(scope.configuration?.reviewSkills!==undefined?{reviewSkills:scope.configuration.reviewSkills}:{})});
   }
   const independentDecision=scope.input.brainMode===SPECIALIST_DECISION_MODE&&missionPlan?specialistDecision(missionPlan,templateDecision.executionAllowed):undefined;
   if(scope.input.brainMode===SPECIALIST_DECISION_MODE&&!independentDecision)throw new ConflictException('Specialist decision missing');
   let providerContracts:Awaited<ReturnType<GovernedModelService['rehearseSpecialistContracts']>>|undefined;
   if(scope.input.simulationMode==='PROVIDER_CONTRACT_V1'&&independentDecision?.draftEligible){
    if(!this.model)throw new ConflictException('Governed model fixture service unavailable');
    providerContracts=await this.model.rehearseSpecialistContracts({organizationId:org,correlationId:id,agentId:scope.templateId,decisionDigest:specialistPlanDigest(independentDecision)});
   }
   let structuredDraft:Awaited<ReturnType<GovernedModelService['rehearseStructuredSpecialistDraft']>>|undefined;
   if(scope.input.structuredDraftMode===STRUCTURED_DRAFT_MODE&&independentDecision?.draftEligible){
    if(!this.model||!scope.contextPin||!missionPlan||!a.scopeDigest)throw new ConflictException('Structured fixture scope unavailable');
    structuredDraft=await this.model.rehearseStructuredSpecialistDraft({organizationId:org,approvalId:id,scopeDigest:a.scopeDigest,templateAgentId:scope.templateId,plan:missionPlan,decision:independentDecision,contextPin:scope.contextPin});
   }
   const reasoningEvaluation=scope.input.evaluationMode===REASONING_EVALUATION_MODE&&missionPlan&&independentDecision?evaluateSpecialistReasoning(missionPlan,independentDecision,scope.contextPin):undefined;
   if(scope.input.evaluationMode===REASONING_EVALUATION_MODE&&!reasoningEvaluation)throw new ConflictException('Specialist decision evaluation missing');
   const outputReview=structuredDraft&&a.scopeDigest?outputReviewScope({organizationId:org,requestedBy:identity.userId,agentId:scope.input.agentId,sourceApprovalId:id,sourceScopeDigest:a.scopeDigest,fixture:structuredDraft,expiresAt:scope.expiresAt}):undefined;
   const reviewId=outputReview?outputReviewId(org,id):undefined;
   const decision={schema:'medsol.specialist-rehearsal-result.v1',agentId:scope.input.agentId,templateAgentId:scope.templateId,
    templateVersion:scope.templateVersion,templateDigest:scope.templateDigest,registrationId:scope.registrationId,
    approvalId:id,scopeDigest:a.scopeDigest,templateDecision,...(structuredDraft?{structuredDraft,structuredDraftDigest:specialistPlanDigest(structuredDraft),outputReviewId:reviewId!}:{}),...(reasoningEvaluation?{reasoningEvaluation,reasoningEvaluationDigest:specialistPlanDigest(reasoningEvaluation)}:{}),...(providerContracts?{providerContracts,providerContractsDigest:specialistPlanDigest(providerContracts)}:{}),...(scope.handover?{handover:scope.handover}:{}),...(independentDecision?{specialistDecision:independentDecision,specialistDecisionDigest:specialistPlanDigest(independentDecision)}:{}),...(scope.configuration?{configuration:scope.configuration}:{}),...(missionPlan?{missionPlan,missionPlanDigest:specialistPlanDigest(missionPlan)}:{}),...(scope.contextPin?{contextEvidence:{pin:scope.contextPin,independentlyVerified:false,sourceTextCopied:false}}:{}),fixtureOnly:true,outputHumanApproved:false,
    autonomousExecutionAuthorized:false,modelCallsAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false,externalEffectsAuthorized:false};
   const status=(independentDecision?independentDecision.draftEligible:templateDecision.executionAllowed)?'COMPLETED':'BLOCKED';
   await tx.agentExecution.create({data:{id:executionId,organizationId:org,agentId:scope.input.agentId,correlationId:id,
    input,decision:decision as unknown as Prisma.InputJsonValue,status,completedAt:new Date()}});
   if(outputReview&&reviewId){
    await tx.approval.create({data:{id:reviewId,organizationId:org,objectType:SPECIALIST_OUTPUT_REVIEW,objectId:scope.input.agentId,requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R3',requestedBy:identity.userId,scope:outputReview as unknown as Prisma.InputJsonValue,scopeDigest:specialistPlanDigest(outputReview),scopeExpiresAt:new Date(outputReview.expiresAt)}});
    await tx.auditEvent.create({data:{organizationId:org,actorType:scheduledDigest?'SYSTEM':'HUMAN',actorId:scheduledDigest?'SPECIALIST_SCHEDULER':identity.userId,action:'OFFLINE_SPECIALIST_OUTPUT_REVIEW_REQUESTED',objectType:SPECIALIST_OUTPUT_REVIEW,objectId:scope.input.agentId,correlationId:reviewId,after:{sourceApprovalId:id,scopeDigest:specialistPlanDigest(outputReview),...(scheduledDigest?{scheduleGrantDigest:scheduledDigest,delegatedBy:identity.userId}:{}),externalEffectsAuthorized:false}}});
   }
   await tx.auditEvent.create({data:{organizationId:org,actorType:scheduledDigest?'SYSTEM':'HUMAN',actorId:scheduledDigest?'SPECIALIST_SCHEDULER':identity.userId,action:'OFFLINE_SPECIALIST_REHEARSAL_EXECUTED',objectType:'AgentExecution',objectId:executionId,correlationId:id,after:{scopeDigest:a.scopeDigest,status,...(scheduledDigest?{scheduleGrantDigest:scheduledDigest,delegatedBy:identity.userId}:{}),externalEffectsAuthorized:false}}});
   return{executionId,status,decision,replayed:false,externalEffectsAuthorized:false};
 }
 async execute(agentId:string,i:{organizationId:string;correlationId:string;causationId?:string;input:unknown;capabilities:string[]}){
 const manifest=AGENT_ROSTER.find(a=>a.id===agentId);
 if(!manifest||!i.organizationId||!i.correlationId)throw new ForbiddenException('Unknown agent or incomplete execution identity');
 // A manifest is one logical agent. Its installed record is tenant-owned and cannot be
 // borrowed by another organization. Retain PAUSED / RETIRED administrative states.
 const installed=await withMarketingTenant(this.db,i.organizationId,tx=>tx.agent.upsert({
   where:{organizationId_id:{organizationId:i.organizationId,id:agentId}},
   create:{id:agentId,organizationId:i.organizationId,name:manifest.name,version:1,
     capabilities:[...manifest.capabilities]},
   update:{}
 }));
 if(installed.status!=='ACTIVE')throw new ForbiddenException('Agent is administratively paused or retired');
 // Agent.version is the authoritative active release pointer; no second roster.
 // Signed revisions may only narrow the built-in identity and capabilities.
 let activeManifest=baselineAgentReleaseManifest(agentId);
 if(installed.version>1){
  const release=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${i.organizationId}, true)`;
   return tx.agentManifestRevision.findFirst({where:{
    organizationId:i.organizationId,agentId,revision:installed.version,
    status:'APPROVED'
   }});
  });
  if(!release)throw new ForbiddenException('Active agent release missing, revoked or unapproved');
  activeManifest=parseAgentReleaseManifest(release.manifest);
  if(agentReleaseDigest(activeManifest)!==release.digest||
   !verifyTrustedAgentReleaseSignature(activeManifest,release.signature,
    release.signerKeyId,agentReleaseTrustConfig()))
   throw new ForbiddenException('Active agent release signature no longer trusted');
 }
 const expectedCapabilities=[...activeManifest.capabilities].sort();
 if(!Array.isArray(installed.capabilities)||
  JSON.stringify([...installed.capabilities].sort())!==JSON.stringify(expectedCapabilities)||
  i.capabilities.some(c=>!activeManifest.capabilities.includes(c)))
  throw new ForbiddenException('Agent requested capability outside active signed release');
 validateAgentInput(i.input,activeManifest.maxInputBytes);
 if(installed.version>1&&process.env.MARKETING_AI_REASONING_ENABLED==='true')
  throw new ForbiddenException('Signed offline-only release cannot invoke a remote model');
 const releaseEvidence={version:installed.version,digest:agentReleaseDigest(activeManifest),
  trustedRelease:installed.version>1,modelCallsAuthorized:false,
  toolCallsAuthorized:false,externalEffectsAuthorized:false};
 const executionId=randomUUID();const started=await withMarketingTenant(this.db,i.organizationId,tx=>tx.agentExecution.create({data:{id:executionId,organizationId:i.organizationId,agentId,correlationId:i.correlationId,...(i.causationId ? {causationId:i.causationId} : {}),input:i.input as any,status:'RUNNING'}}));try{const decision=await this.runtime.execute(agentId,{executionId,organizationId:i.organizationId,correlationId:i.correlationId,...(i.causationId ? {causationId:i.causationId} : {}),input:i.input,capabilities:i.capabilities});let approvedDraft=decision;
 if(process.env.MARKETING_AI_REASONING_ENABLED==='true' && decision.executionAllowed){
   if(!this.model)throw new Error('Governed model service not configured');
   const budget=Number(process.env.MARKETING_MODEL_RESERVATION_MICROS);
   if(!Number.isSafeInteger(budget)||budget<1||budget>100000000)throw new Error('Reviewed model reservation ceiling required');
   const manifest=AGENT_ROSTER.find(a=>a.id===agentId);
   const payload=decision.payload as {workPackage?:unknown;domainAssessment?:unknown;controls?:unknown};
   // Only selected planning fields enter the external model prompt, never the original
   // unrestricted customer payload or raw user-provided references.
   const input=JSON.stringify({agent:manifest?.name,mission:manifest?.mission,workPackage:payload.workPackage,
      domainAssessment:payload.domainAssessment,controls:payload.controls,
      directive:'Generate a draft with explicit hypotheses, traceable sources and unresolved review questions.'});
   const generated=await this.model.complete(executionId+':draft',{
      organizationId:i.organizationId,correlationId:i.correlationId,agentId,
      purpose:'INTERNAL_MARKETING_DRAFT',input,maxOutputTokens:768,timeoutMs:20000,estimatedCostMicros:budget
   });
   approvedDraft={...decision,payload:{...payload,reasoningDraft:{
      text:generated.text,model:generated.model,verified:false,humanApproved:false,
      costMicrosEstimated:generated.actualCostMicros,externalEffectsPermitted:false
   }}};
 }
 const pinnedDecision={...approvedDraft,releaseEvidence};
 await withMarketingTenant(this.db,i.organizationId,tx=>tx.agentExecution.update({where:{id:started.id},data:{decision:pinnedDecision as any,status:pinnedDecision.executionAllowed?'COMPLETED':'BLOCKED',completedAt:new Date()}}));
 return{executionId,decision:pinnedDecision}}catch(error){await withMarketingTenant(this.db,i.organizationId,tx=>tx.agentExecution.update({where:{id:started.id},data:{status:'FAILED',completedAt:new Date(),decision:{error:error instanceof Error?error.message:'Unknown error'} as any}}));throw error}}
 list(){return AGENT_ROSTER.map(m=>({id:m.id,name:m.name,mission:m.mission,capabilities:m.capabilities,registered:this.registry.list().some(a=>a.id===m.id)}))}
}