import {ForbiddenException,Injectable,Optional} from '@nestjs/common'; import {GovernedModelService} from './governed-model.service.js'; import {AgentRegistry,AgentRuntime,AGENT_ROSTER,MarketingDomainAgent} from '@medsol/agent-runtime'; import {PrismaService} from './prisma.service.js'; import {randomUUID} from 'node:crypto';
@Injectable() export class AgentService{
 private readonly registry=new AgentRegistry();private readonly runtime:AgentRuntime;
 constructor(private readonly db:PrismaService,@Optional() private readonly model?:GovernedModelService){for(const manifest of AGENT_ROSTER)this.registry.register(new MarketingDomainAgent(manifest));this.runtime=new AgentRuntime(this.registry)}
 async execute(agentId:string,i:{organizationId:string;correlationId:string;causationId?:string;input:unknown;capabilities:string[]}){
 const manifest=AGENT_ROSTER.find(a=>a.id===agentId);
 if(!manifest||!i.organizationId||!i.correlationId)throw new ForbiddenException('Unknown agent or incomplete execution identity');
 // A manifest is one logical agent. Its installed record is tenant-owned and cannot be
 // borrowed by another organization. Retain PAUSED / RETIRED administrative states.
 const installed=await this.db.agent.upsert({
   where:{organizationId_id:{organizationId:i.organizationId,id:agentId}},
   create:{id:agentId,organizationId:i.organizationId,name:manifest.name,version:1,
     capabilities:[...manifest.capabilities]},
   update:{name:manifest.name,capabilities:[...manifest.capabilities]}
 });
 if(installed.status!=='ACTIVE')throw new ForbiddenException('Agent is administratively paused or retired');
 const executionId=randomUUID();const started=await this.db.agentExecution.create({data:{id:executionId,organizationId:i.organizationId,agentId,correlationId:i.correlationId,...(i.causationId ? {causationId:i.causationId} : {}),input:i.input as any,status:'RUNNING'}});try{const decision=await this.runtime.execute(agentId,{executionId,organizationId:i.organizationId,correlationId:i.correlationId,...(i.causationId ? {causationId:i.causationId} : {}),input:i.input,capabilities:i.capabilities});let approvedDraft=decision;
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
 await this.db.agentExecution.update({where:{id:started.id},data:{decision:approvedDraft as any,status:approvedDraft.executionAllowed?'COMPLETED':'BLOCKED',completedAt:new Date()}});
 return{executionId,decision:approvedDraft}}catch(error){await this.db.agentExecution.update({where:{id:started.id},data:{status:'FAILED',completedAt:new Date(),decision:{error:error instanceof Error?error.message:'Unknown error'} as any}});throw error}}
 list(){return AGENT_ROSTER.map(m=>({id:m.id,name:m.name,mission:m.mission,capabilities:m.capabilities,registered:this.registry.list().some(a=>a.id===m.id)}))}
}