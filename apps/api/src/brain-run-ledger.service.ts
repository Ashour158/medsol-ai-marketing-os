import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaService,withMarketingTenant } from './prisma.service.js';
import { getBrainPlan, validateBrainCommand } from '@medsol/agent-runtime';

function requiredQuarantineReason(value:unknown):string {
 if(typeof value!=='string'||value.trim().length<12||value.length>2000)throw new BadRequestException('Quarantine requires a specific rationale of 12 to 2000 characters');
 return value.trim();
}
@Injectable()
export class BrainRunLedgerService {
 constructor(private readonly db:PrismaService){}
 async create(organizationId:string,raw:unknown,commandKey:string){
  if(typeof commandKey!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(commandKey))throw new BadRequestException('Stable command key required');
  const command=validateBrainCommand(raw);
  if(command.organizationId!==organizationId)throw new BadRequestException('Tenant mismatch');
  const existing=await withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findUnique({where:{organizationId_commandKey:{organizationId,commandKey}},include:{steps:{orderBy:{ordinal:'asc'}}}}));
  if(existing){this.assertSameCommand(existing,command);return existing;}
  const plan=getBrainPlan();
  const stages=plan.stages.flatMap(s=>s.agents.map(agentId=>({agentId,stage:s.stage})));
  try{
   return await withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.create({data:{
    id:randomUUID(),organizationId,commandKey,correlationId:command.correlationId,
    input:command as any,status:'PENDING',
    steps:{create:stages.map((s,ordinal)=>({id:randomUUID(),agentId:s.agentId,stage:s.stage,ordinal,status:'PENDING'}))}
   },include:{steps:{orderBy:{ordinal:'asc'}}}}));
  }catch(error){
   if((error as {code?:string})?.code==='P2002'){
    const winner=await withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findUnique({where:{organizationId_commandKey:{organizationId,commandKey}},include:{steps:{orderBy:{ordinal:'asc'}}}}));
    if(winner){this.assertSameCommand(winner,command);return winner;}
   }
   throw error;
  }
 }
 private assertSameCommand(existing:{input:unknown},command:unknown){
  const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).filter(([k])=>k!=='correlationId').sort(([a],[b])=>a.localeCompare(b))):item);
  const left=createHash('sha256').update(canonical(existing.input)).digest('hex');
  const right=createHash('sha256').update(canonical(command)).digest('hex');
  if(left!==right)throw new ConflictException('Command key already used for a different brain request');
 }
 async get(organizationId:string,id:string){
  const run=await withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findFirst({where:{id,organizationId},include:{steps:{orderBy:{ordinal:'asc'}}}}));
  if(!run)throw new NotFoundException('Brain run not found');
  return run;
 }
 async list(organizationId:string){return withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findMany({where:{organizationId},orderBy:{createdAt:'desc'},take:50,select:{id:true,commandKey:true,correlationId:true,status:true,currentAgentId:true,createdAt:true,updatedAt:true,completedAt:true}}));}
 /**
  * Explicit operator quarantine for an abandoned execution.
  * This never retries steps: a remote execution may have succeeded before the checkpoint.
  */
 async cancelPending(organizationId:string,runId:string,actorId:string,reason:unknown){
  if(typeof reason!=='string'||reason.trim().length<12||reason.length>2000)
   throw new BadRequestException('Cancellation requires a rationale of 12 to 2000 characters');
  const rationale=reason.trim();
  return withMarketingTenant(this.db,organizationId,async tx=>{
   const run=await tx.brainRun.findFirst({where:{id:runId,organizationId}});
   if(!run)throw new NotFoundException('Brain run not found in tenant');
   if(run.status==='CANCELLED')return {runId,status:'CANCELLED',replayed:true,automaticRetryAllowed:false,externalEffectsAuthorized:false};
   if(run.status!=='PENDING')throw new ConflictException('Only an unclaimed PENDING brain run may be cancelled; inspect or quarantine active runs instead');
   const changed=await tx.brainRun.updateMany({where:{id:runId,organizationId,status:'PENDING',updatedAt:run.updatedAt},
    data:{status:'CANCELLED',currentAgentId:null,completedAt:new Date()}});
   if(changed.count!==1)throw new ConflictException('Brain run was claimed or changed concurrently; refresh before acting');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,action:'BRAIN_RUN_CANCELLED_BEFORE_START',
    objectType:'BrainRun',objectId:runId,correlationId:run.correlationId,
    before:{status:'PENDING'},after:{status:'CANCELLED',reason:rationale,automaticRetryAllowed:false,externalEffectsAuthorized:false}}});
   return {runId,status:'CANCELLED',replayed:false,automaticRetryAllowed:false,externalEffectsAuthorized:false};
  });
 }
 async quarantineAbandoned(organizationId:string,runId:string,actorId:string,reason:string){
  const rationale=requiredQuarantineReason(reason);
  const staleBefore=new Date(Date.now()-15*60*1000);
  return withMarketingTenant(this.db,organizationId,async tx=>{
   const run=await tx.brainRun.findFirst({where:{id:runId,organizationId}});
   if(!run)throw new NotFoundException('Brain run not found in tenant');
   if(run.status!=='RUNNING')throw new ConflictException('Only RUNNING brain runs can be quarantined');
   if(run.updatedAt>staleBefore)throw new ConflictException('Brain run is not stale; quarantine requires 15 minutes of inactivity');
   const changed=await tx.brainRun.updateMany({
    where:{id:runId,organizationId,status:'RUNNING',updatedAt:{lte:staleBefore}},
    data:{status:'NEEDS_INTERVENTION',lastError:'Operator quarantine: '+rationale.slice(0,900)}
   });
   if(changed.count!==1)throw new ConflictException('Brain execution state changed concurrently');
   await tx.auditEvent.create({data:{
    organizationId,actorType:'HUMAN',actorId,action:'BRAIN_RUN_QUARANTINED',
    objectType:'BrainRun',objectId:runId,correlationId:run.correlationId,
    before:{status:'RUNNING',currentAgentId:run.currentAgentId},
    after:{status:'NEEDS_INTERVENTION',reason:rationale,automaticRetryAllowed:false}
   }});
   return {runId,status:'NEEDS_INTERVENTION',recovery:'MANUAL_REVIEW_ONLY',automaticRetryAllowed:false};
  });
 }
 async checkpoint(organizationId:string,runId:string,agentId:string,executionId:string){
  if(!executionId)throw new BadRequestException('Execution id required');
  return withMarketingTenant(this.db,organizationId,async tx=>{
   const run=await tx.brainRun.findFirst({where:{id:runId,organizationId},include:{steps:{orderBy:{ordinal:'asc'}}}});
   if(!run)throw new NotFoundException('Brain run not found');
   if(run.status!=='RUNNING')throw new ConflictException('Brain run not eligible for checkpoint');
   const next=run.steps.find(s=>s.status!=='COMPLETED');
   if(!next||next.agentId!==agentId)throw new ConflictException('Out-of-order agent checkpoint');
   const prior=next.ordinal===0?null:run.steps.find(s=>s.ordinal===next.ordinal-1);
   if(next.ordinal>0&&(!prior||prior.status!=='COMPLETED'||!prior.executionId))
    throw new ConflictException('Previous brain checkpoint proof is incomplete');
   // A matching correlation alone is insufficient: a completed agent execution must
   // explicitly belong to this run and to the preceding step's causation chain.
   const execution=await tx.agentExecution.findFirst({where:{
     id:executionId,organizationId,agentId,correlationId:run.correlationId,status:'COMPLETED',
     causationId:prior?.executionId??null,
     input:{path:['brainRunId'],equals:runId}
   }});
   if(!execution)throw new ConflictException('No completed matching agent execution');
   const completed=run.steps.every(s=>s.id===next.id||s.status==='COMPLETED');
   const nextAgentId=completed?null:run.steps[next.ordinal+1]?.agentId??null;
   // Fence a concurrent quarantine or checkpoint BEFORE emitting any event.
   // The same database transaction rolls back the run update if the step/proof fails.
   const runChanged=await tx.brainRun.updateMany({
     where:{id:runId,organizationId,status:'RUNNING',updatedAt:run.updatedAt},
     data:{status:completed?'REVIEW_REQUIRED':'RUNNING',currentAgentId:nextAgentId,
       ...(completed?{completedAt:new Date()}:{})}
   });
   if(runChanged.count!==1)throw new ConflictException('Brain checkpoint lost concurrency fence');
   const changed=await tx.brainRunStep.updateMany({where:{id:next.id,organizationId,runId,status:'PENDING'},
     data:{status:'COMPLETED',executionId,startedAt:execution.startedAt,completedAt:new Date()}});
   if(changed.count!==1)throw new ConflictException('Checkpoint already claimed');
   await tx.outboxEvent.create({data:{
    organizationId, eventId:'brain:'+run.id+':step:'+next.ordinal,
    eventType:'BRAIN_AGENT_STEP_COMPLETED',aggregateType:'BrainRun',aggregateId:run.id,version:1,
    payload:{runId:run.id,agentId,stage:next.stage,ordinal:next.ordinal,executionId,nextAgentId,externalEffectsAuthorized:false},
    correlationId:run.correlationId,causationId:executionId
   }});
   if(completed)await tx.outboxEvent.create({data:{
    organizationId,eventId:'brain:'+run.id+':review',eventType:'BRAIN_RUN_REVIEW_REQUIRED',
    aggregateType:'BrainRun',aggregateId:run.id,version:1,
    payload:{runId:run.id,totalSteps:run.steps.length,approved:false,externalEffectsAuthorized:false},
    correlationId:run.correlationId,causationId:executionId
   }});
   return{runId,agentId,executionId,completed,requiresHumanReview:true};
  });
 }

 /**
  * Read-only crash-window evidence for an authenticated audit operator.
  * Never replays an AgentExecution, changes BrainRun state, releases reserved
  * model funds or infers a provider invoice from an internal success flag.
  */
 async recoveryEvidence(organizationId:string,runId:string){
  const run=await this.get(organizationId,runId);
  const next=run.steps.find(s=>s.status!=='COMPLETED');
  const base={runId:run.id,runStatus:run.status,correlationId:run.correlationId,
   lastProgressAt:run.updatedAt,completedSteps:run.steps.filter(s=>s.status==='COMPLETED').length,
   totalSteps:run.steps.length,automaticReplayAllowed:false as const,
   automaticCheckpointAllowed:false as const,externalPublishingAuthorized:false as const};
  if(!next)return {...base,nextStep:null,evidenceStatus:'NO_PENDING_STEP',
   candidateExecutions:[],modelReconciliation:{reserved:0,unverifiedSettled:0},
   operatorAction:'Review authoritative run and prior human decisions; no recovery execution required'};
  const previous=next.ordinal===0?null:run.steps.find(s=>s.ordinal===next.ordinal-1);
  const expectedCausation=previous?.executionId??null;
  const rows=await withMarketingTenant(this.db,organizationId,tx=>tx.agentExecution.findMany({where:{
   organizationId,agentId:next.agentId,correlationId:run.correlationId,
   input:{path:['brainRunId'],equals:runId}
  },select:{id:true,status:true,causationId:true,startedAt:true,completedAt:true},
   orderBy:[{startedAt:'desc'},{id:'desc'}],take:101}));
  const overflow=rows.length>100;
  const bounded=rows.slice(0,100);
  const requests=bounded.map(r=>r.id+':draft');
  const usages=requests.length?await withMarketingTenant(this.db,organizationId,tx=>tx.modelUsage.findMany({
   where:{organizationId,requestId:{in:requests}},
   select:{requestId:true,status:true,billingStatus:true}
  })):[];
  const byRequest=new Map(usages.map(u=>[u.requestId,u]));
  const candidateExecutions=bounded.map(e=>({
   executionId:e.id,status:e.status,
   causationMatches:e.causationId===expectedCausation&&
     (next.ordinal===0||previous?.status==='COMPLETED'),
   modelReservation:byRequest.get(e.id+':draft')?.status??null,
   modelInvoiceVerified:byRequest.get(e.id+':draft')?.billingStatus==='VERIFIED'
  }));
  const validCompleted=candidateExecutions.filter(e=>e.status==='COMPLETED'&&e.causationMatches);
  const stale=run.updatedAt.getTime()<=Date.now()-15*60_000;
  const evidenceStatus=overflow?'EXCESS_EXECUTION_EVIDENCE':
    candidateExecutions.some(e=>!e.causationMatches)?'CONFLICTING_CAUSATION':
    candidateExecutions.some(e=>e.status==='RUNNING'||e.status==='FAILED')?'AMBIGUOUS_AGENT_OUTCOME':
    validCompleted.length===1&&candidateExecutions.length===1?'ONE_COMPLETED_UNCHECKPOINTED':
    candidateExecutions.length>1?'MULTIPLE_EXECUTION_ATTEMPTS':
    run.status==='RUNNING'&&!stale?'MAY_STILL_BE_ACTIVE':
    run.status==='CANCELLED'&&candidateExecutions.length===0?'CANCELLED_BEFORE_START':
    'NO_COMPLETED_EXECUTION_PROOF';
  return {...base,nextStep:{agentId:next.agentId,ordinal:next.ordinal,status:next.status},
   staleByLastProgress:stale,evidenceStatus,candidateCountAtLeast:rows.length,
   candidatesTruncated:overflow,candidateExecutions,
   modelReconciliation:{
    reserved:usages.filter(u=>u.status==='RESERVED').length,
    unverifiedSettled:usages.filter(u=>u.status==='SETTLED'&&u.billingStatus!=='VERIFIED').length
   },
   operatorAction:evidenceStatus==='CANCELLED_BEFORE_START'?'Run was cancelled before dispatch; create a new separately authorized request if required.':
    'Compare execution and provider billing records, then investigate; no agent replay, checkpoint repair or release is authorized by this report'};
 }
}
