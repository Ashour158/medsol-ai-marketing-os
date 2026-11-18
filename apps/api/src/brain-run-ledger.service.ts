import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaService } from './prisma.service.js';
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
  const existing=await this.db.brainRun.findUnique({where:{organizationId_commandKey:{organizationId,commandKey}},include:{steps:{orderBy:{ordinal:'asc'}}}});
  if(existing){this.assertSameCommand(existing,command);return existing;}
  const plan=getBrainPlan();
  const stages=plan.stages.flatMap(s=>s.agents.map(agentId=>({agentId,stage:s.stage})));
  try{
   return await this.db.brainRun.create({data:{
    id:randomUUID(),organizationId,commandKey,correlationId:command.correlationId,
    input:command as any,status:'PENDING',
    steps:{create:stages.map((s,ordinal)=>({id:randomUUID(),organizationId,agentId:s.agentId,stage:s.stage,ordinal,status:'PENDING'}))}
   },include:{steps:{orderBy:{ordinal:'asc'}}}});
  }catch(error){
   if((error as {code?:string})?.code==='P2002'){
    const winner=await this.db.brainRun.findUnique({where:{organizationId_commandKey:{organizationId,commandKey}},include:{steps:{orderBy:{ordinal:'asc'}}}});
    if(winner){this.assertSameCommand(winner,command);return winner;}
   }
   throw error;
  }
 }
 private assertSameCommand(existing:{input:unknown},command:unknown){
  const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
  const left=createHash('sha256').update(canonical(existing.input)).digest('hex');
  const right=createHash('sha256').update(canonical(command)).digest('hex');
  if(left!==right)throw new ConflictException('Command key already used for a different brain request');
 }
 async get(organizationId:string,id:string){
  const run=await this.db.brainRun.findFirst({where:{id,organizationId},include:{steps:{orderBy:{ordinal:'asc'}}}});
  if(!run)throw new NotFoundException('Brain run not found');
  return run;
 }
 async list(organizationId:string){return this.db.brainRun.findMany({where:{organizationId},orderBy:{createdAt:'desc'},take:50,select:{id:true,commandKey:true,correlationId:true,status:true,currentAgentId:true,createdAt:true,updatedAt:true,completedAt:true}});}
 /**
  * Explicit operator quarantine for an abandoned execution.
  * This never retries steps: a remote execution may have succeeded before the checkpoint.
  */
 async quarantineAbandoned(organizationId:string,runId:string,actorId:string,reason:string){
  const rationale=requiredQuarantineReason(reason);
  const staleBefore=new Date(Date.now()-15*60*1000);
  return this.db.$transaction(async tx=>{
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
  return this.db.$transaction(async tx=>{
   const run=await tx.brainRun.findFirst({where:{id:runId,organizationId},include:{steps:{orderBy:{ordinal:'asc'}}}});
   if(!run)throw new NotFoundException('Brain run not found');
   if(run.status!=='RUNNING')throw new ConflictException('Brain run not eligible for checkpoint');
   const next=run.steps.find(s=>s.status!=='COMPLETED');
   if(!next||next.agentId!==agentId)throw new ConflictException('Out-of-order agent checkpoint');
   const execution=await tx.agentExecution.findFirst({where:{id:executionId,organizationId,agentId,correlationId:run.correlationId,status:'COMPLETED'}});
   if(!execution)throw new ConflictException('No completed matching agent execution');
   const changed=await tx.brainRunStep.updateMany({where:{id:next.id,organizationId,status:'PENDING'},data:{status:'COMPLETED',executionId,startedAt:execution.startedAt,completedAt:new Date()}});
   if(changed.count!==1)throw new ConflictException('Checkpoint already claimed');
   const completed=run.steps.every(s=>s.id===next.id||s.status==='COMPLETED');
   await tx.brainRun.update({where:{id:run.id},data:{status:completed?'REVIEW_REQUIRED':'RUNNING',currentAgentId:completed?null:run.steps[next.ordinal+1]?.agentId??null,...(completed?{completedAt:new Date()}:{})}});
   return{runId,agentId,executionId,completed,requiresHumanReview:true};
  });
 }
}
