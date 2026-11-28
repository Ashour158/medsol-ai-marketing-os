import {validateAgentInput} from '@medsol/agent-runtime';
import {agentReleaseDigest,agentReleaseTrustConfig,baselineAgentReleaseManifest,
 parseAgentReleaseManifest,verifyTrustedAgentReleaseSignature}
 from './agent-manifest-release.js';
import {BadRequestException,ConflictException,NotFoundException,ForbiddenException,Injectable,Optional} from '@nestjs/common'; import {GovernedModelService} from './governed-model.service.js'; import {AgentRegistry,AgentRuntime,AGENT_ROSTER,MarketingDomainAgent} from '@medsol/agent-runtime'; import {PrismaService,withMarketingTenant} from './prisma.service.js'; import {randomUUID} from 'node:crypto';
import type {VerifiedIdentity} from './oidc-identity.js';
import type {Prisma} from '@prisma/client';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {SPECIALIST_REHEARSAL,rehearsalInput,rehearsalId,rehearsalScope,rehearsalDigest,readRehearsal,currentSpecialistTemplate,validateRehearsal} from './offline-specialist-rehearsal.js';
import {lockSpecialist,readSpecialist,SPECIALIST_REGISTRATION} from './offline-specialist.js';
import {SPECIALIST_BRAIN_MODE,specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
import {configPinTuple,type ConfigPin} from './offline-specialist-config.js';
import {MarketingLearningService} from './marketing-learning.service.js';
import {loadSpecialistContextPin,contextPinTuple} from './specialist-context-pin.js';
@Injectable() export class AgentService{
 private readonly registry=new AgentRegistry();private readonly runtime:AgentRuntime;
 constructor(private readonly db:PrismaService,@Optional() private readonly model?:GovernedModelService,@Optional() private readonly learning?:MarketingLearningService){for(const manifest of AGENT_ROSTER)this.registry.register(new MarketingDomainAgent(manifest));this.runtime=new AgentRuntime(this.registry)}
 async requestSpecialistRehearsal(identity:VerifiedIdentity,raw:unknown){
  const input=rehearsalInput(raw),org=identity.organizationId,id=rehearsalId(org,input.requestKey);
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await lockSpecialist(tx,org);
   const prior=await tx.approval.findFirst({where:{organizationId:org,id}});
   if(prior){
    const scope=readRehearsal(prior);
    if(scope.requestedBy!==identity.userId||JSON.stringify(scope.input)!==JSON.stringify(input))throw new ConflictException('Immutable specialist rehearsal key already used');
    return{approvalId:id,decision:prior.decision,...scope,replayed:true};
   }
   const template=await currentSpecialistTemplate(tx,org,input.agentId);
   const contextPin=input.contextQuery!==undefined?await loadSpecialistContextPin(this.learning,tx,org,input.agentId,input.contextQuery):undefined;
   const scope=rehearsalScope(org,identity.userId,input,template,new Date(Date.now()+86400000).toISOString(),contextPin);
   await tx.approval.create({data:{id,organizationId:org,objectType:SPECIALIST_REHEARSAL,objectId:input.agentId,
    requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R3',requestedBy:identity.userId,scope,scopeDigest:rehearsalDigest(scope),
    scopeExpiresAt:new Date(scope.expiresAt)}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_REHEARSAL_REQUESTED',objectType:'Agent',objectId:input.agentId,correlationId:id,after:{scopeDigest:rehearsalDigest(scope),externalEffectsAuthorized:false}}});
   return{approvalId:id,decision:'PENDING',...scope,replayed:false};
  });
 }
 async executeSpecialistRehearsal(identity:VerifiedIdentity,raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='approvalId,fixtureOnly')throw new BadRequestException('Exact approved rehearsal reference required');
  const v=raw as {approvalId?:unknown;fixtureOnly?:unknown};
  if(v.fixtureOnly!==true||typeof v.approvalId!=='string'||!/^specialist-run-[0-9a-f]{64}$/.test(v.approvalId))throw new BadRequestException('Invalid rehearsal reference');
  const id=v.approvalId,org=identity.organizationId,executionId=id+'-execution';
  if(process.env.MARKETING_AI_REASONING_ENABLED==='true')throw new ForbiddenException('Specialist rehearsal requires offline reasoning');
  return withMarketingTenant(this.db,org,async tx=>{
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
    if(scope.configuration){if(!d.configuration||JSON.stringify(configPinTuple(d.configuration as ConfigPin))!==JSON.stringify(configPinTuple(scope.configuration)))throw new ConflictException('Historical specialist configuration evidence invalid');}
    else if(d.configuration!==undefined)throw new ConflictException('Unexpected historical specialist configuration');
    if(scope.input.brainMode===SPECIALIST_BRAIN_MODE){
     const plan=d.missionPlan as Record<string,unknown>|undefined;
     if(!plan||plan.mode!==SPECIALIST_BRAIN_MODE||plan.humanReviewRequired!==true||plan.scientificVerification!==false||plan.externalEffectsAuthorized!==false||plan.modelCallsAuthorized!==false||plan.toolCallsAuthorized!==false||plan.memoryWritesAuthorized!==false||plan.autonomousExecutionAuthorized!==false||specialistPlanDigest(plan)!==d.missionPlanDigest)throw new ConflictException('Historical specialist mission plan invalid');
    }else if(d.missionPlan!==undefined||d.missionPlanDigest!==undefined)throw new ConflictException('Unexpected historical specialist mission plan');
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
   if(scope.input.brainMode===SPECIALIST_BRAIN_MODE){
    const registration=await tx.approval.findFirst({where:{organizationId:org,id:scope.registrationId,objectType:SPECIALIST_REGISTRATION,objectId:scope.input.agentId,decision:'APPROVED'}});
    if(!registration||registration.scopeDigest!==scope.registrationDigest)throw new ConflictException('Specialist mission registration changed');
    const registered=readSpecialist(registration);
    missionPlan=specialistMissionPlan({mission:scope.configuration?.mission??registered.input.mission,objective:scope.input.objective,market:scope.input.market,capability:scope.capability,references:scope.contextPin?.references.map(r=>r.citationRef)??[]});
   }
   const decision={schema:'medsol.specialist-rehearsal-result.v1',agentId:scope.input.agentId,templateAgentId:scope.templateId,
    templateVersion:scope.templateVersion,templateDigest:scope.templateDigest,registrationId:scope.registrationId,
    approvalId:id,scopeDigest:a.scopeDigest,templateDecision,...(scope.configuration?{configuration:scope.configuration}:{}),...(missionPlan?{missionPlan,missionPlanDigest:specialistPlanDigest(missionPlan)}:{}),...(scope.contextPin?{contextEvidence:{pin:scope.contextPin,independentlyVerified:false,sourceTextCopied:false}}:{}),fixtureOnly:true,outputHumanApproved:false,
    autonomousExecutionAuthorized:false,modelCallsAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false,externalEffectsAuthorized:false};
   const status=templateDecision.executionAllowed?'COMPLETED':'BLOCKED';
   await tx.agentExecution.create({data:{id:executionId,organizationId:org,agentId:scope.input.agentId,correlationId:id,
    input,decision:decision as unknown as Prisma.InputJsonValue,status,completedAt:new Date()}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_REHEARSAL_EXECUTED',objectType:'AgentExecution',objectId:executionId,correlationId:id,after:{scopeDigest:a.scopeDigest,status,externalEffectsAuthorized:false}}});
   return{executionId,status,decision,replayed:false,externalEffectsAuthorized:false};
  });
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