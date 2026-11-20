import {validateAgentInput} from '@medsol/agent-runtime';
import {agentReleaseDigest,agentReleaseTrustConfig,baselineAgentReleaseManifest,
 parseAgentReleaseManifest,verifyTrustedAgentReleaseSignature}
 from './agent-manifest-release.js';
import {ForbiddenException,Injectable,Optional} from '@nestjs/common'; import {GovernedModelService} from './governed-model.service.js'; import {AgentRegistry,AgentRuntime,AGENT_ROSTER,MarketingDomainAgent} from '@medsol/agent-runtime'; import {PrismaService,withMarketingTenant} from './prisma.service.js'; import {randomUUID} from 'node:crypto';
@Injectable() export class AgentService{
 private readonly registry=new AgentRegistry();private readonly runtime:AgentRuntime;
 constructor(private readonly db:PrismaService,@Optional() private readonly model?:GovernedModelService){for(const manifest of AGENT_ROSTER)this.registry.register(new MarketingDomainAgent(manifest));this.runtime=new AgentRuntime(this.registry)}
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