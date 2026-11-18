import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service.js';
import { getBrainPlan, validateBrainCommand } from '@medsol/agent-runtime';

@Injectable()
export class BrainRunLedgerService {
 constructor(private readonly db:PrismaService){}
 async create(organizationId:string,raw:unknown,commandKey:string){
  if(typeof commandKey!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(commandKey))throw new BadRequestException('Stable command key required');
  const command=validateBrainCommand(raw);
  if(command.organizationId!==organizationId)throw new BadRequestException('Tenant mismatch');
  const existing=await this.db.brainRun.findUnique({where:{organizationId_commandKey:{organizationId,commandKey}},include:{steps:{orderBy:{ordinal:'asc'}}}});
  if(existing)return existing;
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
    if(winner)return winner;
   }
   throw error;
  }
 }
 async get(organizationId:string,id:string){
  const run=await this.db.brainRun.findFirst({where:{id,organizationId},include:{steps:{orderBy:{ordinal:'asc'}}}});
  if(!run)throw new NotFoundException('Brain run not found');
  return run;
 }
 async list(organizationId:string){return this.db.brainRun.findMany({where:{organizationId},orderBy:{createdAt:'desc'},take:50,select:{id:true,commandKey:true,correlationId:true,status:true,currentAgentId:true,createdAt:true,updatedAt:true,completedAt:true}});}
 async checkpoint(organizationId:string,runId:string,agentId:string,executionId:string){
  if(!executionId)throw new BadRequestException('Execution id required');
  return this.db.$transaction(async tx=>{
   const run=await tx.brainRun.findFirst({where:{id:runId,organizationId},include:{steps:{orderBy:{ordinal:'asc'}}}});
   if(!run)throw new NotFoundException('Brain run not found');
   if(run.status!=='PENDING'&&run.status!=='REVIEW_REQUIRED')throw new ConflictException('Brain run not eligible for checkpoint');
   const next=run.steps.find(s=>s.status!=='COMPLETED');
   if(!next||next.agentId!==agentId)throw new ConflictException('Out-of-order agent checkpoint');
   const execution=await tx.agentExecution.findFirst({where:{id:executionId,organizationId,agentId,correlationId:run.correlationId,status:'COMPLETED'}});
   if(!execution)throw new ConflictException('No completed matching agent execution');
   const changed=await tx.brainRunStep.updateMany({where:{id:next.id,organizationId,status:'PENDING'},data:{status:'COMPLETED',executionId,startedAt:execution.startedAt,completedAt:new Date()}});
   if(changed.count!==1)throw new ConflictException('Checkpoint already claimed');
   const completed=run.steps.every(s=>s.id===next.id||s.status==='COMPLETED');
   await tx.brainRun.update({where:{id:run.id},data:{status:completed?'REVIEW_REQUIRED':'PENDING',currentAgentId:completed?null:run.steps[next.ordinal+1]?.agentId??null,...(completed?{completedAt:new Date()}:{})}});
   return{runId,agentId,executionId,completed,requiresHumanReview:true};
  });
 }
}
