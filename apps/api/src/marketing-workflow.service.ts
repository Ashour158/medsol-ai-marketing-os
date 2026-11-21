import {AGENT_ROSTER} from '@medsol/agent-runtime';
import {parseOfflineDagManifest,offlineDagDigest,verifyOfflineDagSignature,
 offlineDagTrust,planOfflineDag,canaryAllows,SAFE_DAG_CAPABILITY}
 from './r3g-offline-dag.js';
import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {MarketingLearningService} from './marketing-learning.service.js';
import {curateDagEvidence,assertDagEvidenceCurrent,type DagEvidenceRef} from './r3g-dag-evidence.js';
import { createHash,randomUUID } from 'node:crypto';
import { MarketingRequest, MarketingRequestSchema,simulateBlueprintDraft,type BlueprintSimulationResult } from '@medsol/contracts';
import { PrismaService,withMarketingTenant } from './prisma.service.js';
import { AgentService } from './agent.service.js';
import { CampaignService } from './campaign.service.js';
import { WorkflowLeaseService, type WorkflowLease } from './workflow-lease.service.js';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';

type WorkflowResult = { workflowExecutionId: string; status: string; currentStep: string; correlationId: string; output?: unknown };

@Injectable()
export class MarketingWorkflowService {
  constructor(private readonly db: PrismaService, private readonly agents: AgentService, private readonly campaigns: CampaignService, private readonly leases: WorkflowLeaseService,
    @Optional() private readonly learning?: MarketingLearningService) {}


  /**
   * R3 virtual graph run. The existing WorkflowExecution/WorkflowStepExecution
   * is the sole execution ledger. It is a deterministic, atomic no-effect
   * simulation: does NOT call agents, models, MCP, A2A, or domain commands.
   * Later real graph execution must use the canonical lease/fencing engine.
   */
  async simulateBlueprint(organizationId:string,identity:VerifiedIdentity,
    input:{draft?:unknown;requestKey?:unknown}){
    if(!identity||identity.organizationId!==organizationId||
       !identity.userId||!identity.subject||
       !hasMarketingPermission(identity,'EXECUTE_WORKFLOW'))
      throw new ForbiddenException('Verified tenant workflow operator required');
    const requestKey=input?.requestKey;
    if(typeof requestKey!=='string'||requestKey.length<12||
       requestKey.length>160||!/^[A-Za-z0-9_-]+$/.test(requestKey))
      throw new BadRequestException('Stable 12-160 character simulation idempotency key required');
    const preview=simulateBlueprintDraft(input?.draft);
    const sourceDigest=createHash('sha256').update(
     JSON.stringify(input?.draft??null)).digest('hex');
    const fingerprint=createHash('sha256').update(JSON.stringify([
     'medsol-r3-virtual-blueprint-v1',organizationId,identity.userId,requestKey
    ])).digest('hex');
    const correlationId='r3-virtual-'+fingerprint;
    const authorize=async(tx:Prisma.TransactionClient)=>{
      const actor=await tx.user.findFirst({where:{
       organizationId,id:identity.userId,oidcSubject:identity.subject,disabledAt:null
      },select:{role:true}});
      if(!actor||actor.role.toUpperCase()!==identity.role.toUpperCase())
       throw new ForbiddenException('Active OIDC tenant operator required');
    };
    const lookup=async(tx:Prisma.TransactionClient)=>{
      const row=await tx.workflowExecution.findFirst({where:{
       organizationId,correlationId,workflowType:'BLUEPRINT_VIRTUAL_SIMULATION'
      }});
      if(!row)return null;
      const meta=row.input as {sourceDigest?:string};
      if(meta?.sourceDigest!==sourceDigest)
       throw new ConflictException('Blueprint simulation key already bound to another draft');
      return{workflowExecutionId:row.id,status:'SIMULATED' as const,
       replayed:true,saved:true,preview:row.output as unknown as BlueprintSimulationResult,
       externalEffectsAuthorized:false as const};
    };
    const work=async(tx:Prisma.TransactionClient)=>{
      await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
      await authorize(tx);
      const existing=await lookup(tx);
      if(existing)return existing;
      if(preview.status!=='SIMULATED')
       return{workflowExecutionId:null,status:'BLOCKED' as const,
        replayed:false,saved:false,preview,externalEffectsAuthorized:false as const};
      const now=new Date();
      const workflow=await tx.workflowExecution.create({data:{
       id:randomUUID(),organizationId,correlationId,
       workflowType:'BLUEPRINT_VIRTUAL_SIMULATION',
       currentStep:'SIMULATED_END',status:'COMPLETED',
       input:{blueprintId:preview.blueprintId,version:preview.version,
        sourceDigest,simulationOnly:true,externalEffectsAuthorized:false},
       output:preview as unknown as Prisma.InputJsonValue,
       completedAt:now
      }});
      await tx.workflowStepExecution.createMany({data:preview.steps.map(step=>({
       organizationId,workflowExecutionId:workflow.id,stepKey:step.nodeId,
       status:'COMPLETED',
       input:{nodeId:step.nodeId,nodeType:step.nodeType,
        virtualAgentId:step.agentId},
       output:{kind:step.kind,order:step.order,
        predecessors:step.predecessors,downstream:step.downstream,
        requiresHumanDecision:step.requiresHumanDecision,
        isActualAgentExecution:false,externalEffectsAuthorized:false},
       completedAt:now
      }))});
      await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
       actorId:identity.userId,action:'BLUEPRINT_VIRTUAL_SIMULATION_COMPLETED',
       objectType:'WorkflowExecution',objectId:workflow.id,
       correlationId:workflow.id,after:{blueprintId:preview.blueprintId,
        sourceDigest,virtualSteps:preview.stepCount,
        realAgentExecutions:0,modelCalls:0,mcpCalls:0,domainWrites:0,
        externalEffectsAuthorized:false}}});
      await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
       eventType:'BlueprintVirtualSimulationCompletedInternal',
       aggregateType:'WorkflowExecution',aggregateId:workflow.id,
       correlationId:workflow.id,
       payload:{workflowExecutionId:workflow.id,
        blueprintId:preview.blueprintId,virtualSteps:preview.stepCount,
        externalEffectsAuthorized:false}}});
      return{workflowExecutionId:workflow.id,status:'SIMULATED' as const,
       replayed:false,saved:true,preview,externalEffectsAuthorized:false as const};
    };
    try{
      return await this.db.$transaction(work,{
       isolationLevel:Prisma.TransactionIsolationLevel.Serializable
      });
    }catch(error){
      if(!['P2002','P2034'].includes((error as {code?:string})?.code??''))
       throw error;
      return this.db.$transaction(async tx=>{
       await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
       await authorize(tx);
       const existing=await lookup(tx);
       if(existing)return existing;
       throw new ConflictException('Concurrent blueprint simulation claim; retry same key');
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    }
  }


  // R3-G. This is the existing canonical workflow authority; there is
  // intentionally no second scheduler, agent registry or workflow ledger.
  private dagTransaction<T>(organizationId:string,
    fn:(tx:Prisma.TransactionClient)=>Promise<T>){
    if(!/^[A-Za-z0-9_-]{3,160}$/.test(organizationId))
      throw new BadRequestException('Stable tenant identifier required');
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
      return fn(tx);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
  private async dagAuthorize(tx:Prisma.TransactionClient,organizationId:string,
   identity:VerifiedIdentity,permission:'MANAGE_TENANT'|'EXECUTE_WORKFLOW'|'READ_AUDIT'){
    if(!identity||identity.organizationId!==organizationId||!identity.subject||
       !hasMarketingPermission(identity,permission))
      throw new ForbiddenException('Verified tenant workflow authority required');
    const user=await tx.user.findFirst({where:{
      id:identity.userId,organizationId,oidcSubject:identity.subject,disabledAt:null
    },select:{role:true}});
    if(!user||user.role.toUpperCase()!==identity.role.toUpperCase())
      throw new ForbiddenException('Active matching tenant OIDC user required');
    if(permission==='MANAGE_TENANT'&&
       !['ADMIN','SUPER_ADMIN'].includes(user.role.toUpperCase()))
      throw new ForbiddenException('Tenant administrator required');
  }
  private dagId(raw:unknown){
    if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{3,160}$/.test(raw))
      throw new BadRequestException('Stable workflow release identifier required');
    return raw;
  }
  private dagRevision(raw:unknown,zero=false){
    if(!Number.isSafeInteger(raw)||(raw as number)<(zero?0:1)||
       (raw as number)>1000000)
      throw new BadRequestException('Expected active revision required');
    return raw as number;
  }
  private dagEnabled(){
    if(process.env.MARKETING_DAG_OFFLINE_EXECUTION_ENABLED!=='true')
      throw new ForbiddenException('Offline DAG runtime is disabled by default');
    if(process.env.MARKETING_AI_REASONING_ENABLED==='true')
      throw new ForbiddenException('Offline DAG refuses external model-enabled agent runtime');
  }
  private dagReleaseProjection(row:{
   id:string;blueprintId:string;revision:number;manifest:Prisma.JsonValue;
   digest:string;signature:string;signerKeyId:string;status:string;
   createdBy:string;approvedBy:string|null;approvedAt:Date|null;
   activatedAt:Date|null;revokedAt:Date|null
  }){
    const trusted=verifyOfflineDagSignature(row.manifest,row.signature,
     row.signerKeyId,offlineDagTrust());
    const manifest=parseOfflineDagManifest(row.manifest);
    return{id:row.id,blueprintId:row.blueprintId,revision:row.revision,
     digest:row.digest,status:row.status,canaryPercent:manifest.canaryPercent,
     stepCount:manifest.draft.nodes.length,signatureTrusted:trusted,
     createdBy:row.createdBy,approvedBy:row.approvedBy,
     approvedAt:row.approvedAt,activatedAt:row.activatedAt,
     revokedAt:row.revokedAt,externalEffectsAuthorized:false as const};
  }
  async dagReleases(organizationId:string,identity:VerifiedIdentity,blueprintId?:unknown){
    const filter=blueprintId===undefined?undefined:this.dagId(blueprintId);
    return this.dagTransaction(organizationId,async tx=>{
      await this.dagAuthorize(tx,organizationId,identity,'MANAGE_TENANT');
      const rows=await tx.blueprintDeployment.findMany({
       where:{organizationId,...(filter?{blueprintId:filter}:{})},
       orderBy:[{blueprintId:'asc'},{revision:'desc'}],take:100});
      return rows.map(row=>this.dagReleaseProjection(row));
    });
  }
  async dagPropose(organizationId:string,identity:VerifiedIdentity,input:{
    manifest?:unknown;signature?:unknown;signerKeyId?:unknown
  }){
    const manifest=parseOfflineDagManifest(input?.manifest);
    const digest=offlineDagDigest(manifest);
    const signature=typeof input?.signature==='string'?input.signature:'';
    const signerKeyId=this.dagId(input?.signerKeyId);
    if(!verifyOfflineDagSignature(manifest,signature,signerKeyId,offlineDagTrust()))
      throw new ForbiddenException('Separately trusted Ed25519 DAG release required');
    return this.dagTransaction(organizationId,async tx=>{
      await this.dagAuthorize(tx,organizationId,identity,'MANAGE_TENANT');
      const prior=await tx.blueprintDeployment.findFirst({where:{
       organizationId,blueprintId:manifest.draft.id,
       revision:manifest.draft.version}});
      if(prior){
        if(prior.digest!==digest||prior.signature!==signature||
           prior.signerKeyId!==signerKeyId)
          throw new ConflictException('Immutable blueprint version already registered');
        return{...this.dagReleaseProjection(prior),replayed:true};
      }
      const previous=await tx.blueprintDeployment.findFirst({
       where:{organizationId,blueprintId:manifest.draft.id},
       orderBy:{revision:'desc'},select:{revision:true}});
      if(manifest.draft.version!==(previous?.revision??0)+1)
       throw new ConflictException('Blueprint revisions must advance monotonically by one');
      const row=await tx.blueprintDeployment.create({data:{
       id:randomUUID(),organizationId,blueprintId:manifest.draft.id,
       revision:manifest.draft.version,
       manifest:manifest as unknown as Prisma.InputJsonValue,digest,
       signature,signerKeyId,status:'PROPOSED',createdBy:identity.userId
      }});
      await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
       actorId:identity.userId,action:'DAG_RELEASE_PROPOSED',
       objectType:'BlueprintDeployment',objectId:row.id,correlationId:row.id,
       after:{digest,revision:row.revision,externalEffectsAuthorized:false}}});
      return{...this.dagReleaseProjection(row),replayed:false};
    });
  }
  async dagApprove(organizationId:string,identity:VerifiedIdentity,
   idInput:unknown,expectedRevision:unknown){
    const id=this.dagId(idInput),expected=this.dagRevision(expectedRevision);
    return this.dagTransaction(organizationId,async tx=>{
      await this.dagAuthorize(tx,organizationId,identity,'MANAGE_TENANT');
      const row=await tx.blueprintDeployment.findFirst({where:{organizationId,id}});
      if(!row)throw new NotFoundException('Blueprint release not found');
      if(row.revision!==expected||row.status!=='PROPOSED')
       throw new ConflictException('Stale or already reviewed blueprint');
      if(row.createdBy===identity.userId)
       throw new ForbiddenException('Independent blueprint release reviewer required');
      if(offlineDagDigest(row.manifest)!==row.digest||
       !verifyOfflineDagSignature(row.manifest,row.signature,
        row.signerKeyId,offlineDagTrust()))
       throw new ForbiddenException('Blueprint signature or immutable digest invalid');
      const changed=await tx.blueprintDeployment.updateMany({
       where:{id,organizationId,status:'PROPOSED',revision:expected},
       data:{status:'APPROVED',approvedBy:identity.userId,approvedAt:new Date()}});
      if(changed.count!==1)throw new ConflictException('Concurrent blueprint decision');
      await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
       actorId:identity.userId,action:'DAG_RELEASE_APPROVED',
       objectType:'BlueprintDeployment',objectId:id,correlationId:id,
       after:{digest:row.digest,dispatchAuthorized:false}}});
      return this.dagReleaseProjection(await tx.blueprintDeployment.findFirstOrThrow({
       where:{id,organizationId}}));
    });
  }
  /** Activating a previously superseded revision is an audited rollback. */
  async dagActivate(organizationId:string,identity:VerifiedIdentity,
   idInput:unknown,expectedActiveRevision:unknown){
    const id=this.dagId(idInput),expected=this.dagRevision(expectedActiveRevision,true);
    return this.dagTransaction(organizationId,async tx=>{
      await this.dagAuthorize(tx,organizationId,identity,'MANAGE_TENANT');
      const target=await tx.blueprintDeployment.findFirst({
       where:{id,organizationId}});
      if(!target)throw new NotFoundException('Blueprint release not found');
      const current=await tx.blueprintDeployment.findFirst({where:{
       organizationId,blueprintId:target.blueprintId,status:'ACTIVE'}});
      if((current?.revision??0)!==expected)
       throw new ConflictException('Stale active blueprint revision');
      if(current?.id===id)return{
       ...this.dagReleaseProjection(current),replayed:true};
      if(!['APPROVED','SUPERSEDED'].includes(target.status))
       throw new ConflictException('Signed approved or superseded release required');
      if(offlineDagDigest(target.manifest)!==target.digest||
       !verifyOfflineDagSignature(target.manifest,target.signature,
        target.signerKeyId,offlineDagTrust()))
       throw new ForbiddenException('Untrusted or changed blueprint release');
      if(current){
       const changed=await tx.blueprintDeployment.updateMany({where:{
        id:current.id,organizationId,status:'ACTIVE'},
        data:{status:'SUPERSEDED'}});
       if(changed.count!==1)throw new ConflictException('Concurrent blueprint switch');
      }
      const changed=await tx.blueprintDeployment.updateMany({where:{
       id,organizationId,status:target.status},
       data:{status:'ACTIVE',activatedBy:identity.userId,activatedAt:new Date()}});
      if(changed.count!==1)throw new ConflictException('Concurrent blueprint activation');
      const action=target.status==='SUPERSEDED'?'DAG_RELEASE_ROLLBACK':'DAG_RELEASE_ACTIVATED';
      await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
       actorId:identity.userId,action,objectType:'BlueprintDeployment',
       objectId:id,correlationId:id,before:{activeRevision:expected},
       after:{activeRevision:target.revision,digest:target.digest,
        canaryPercent:parseOfflineDagManifest(target.manifest).canaryPercent,
        externalEffectsAuthorized:false}}});
      await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
       eventType:'OfflineDagDeploymentChangedInternal',aggregateType:'BlueprintDeployment',
       aggregateId:id,version:target.revision,correlationId:id,
       payload:{blueprintId:target.blueprintId,
        activeRevision:target.revision,externalEffectsAuthorized:false}}});
      return{...this.dagReleaseProjection(await tx.blueprintDeployment.findFirstOrThrow({
       where:{id,organizationId}})),replayed:false};
    });
  }
  async dagRevoke(organizationId:string,identity:VerifiedIdentity,
   idInput:unknown,reasonInput:unknown){
    const id=this.dagId(idInput);
    const reason=typeof reasonInput==='string'?reasonInput.trim():'';
    if(reason.length<12||reason.length>500)
     throw new BadRequestException('Explicit release revocation reason required');
    return this.dagTransaction(organizationId,async tx=>{
     await this.dagAuthorize(tx,organizationId,identity,'MANAGE_TENANT');
     const row=await tx.blueprintDeployment.findFirst({where:{id,organizationId}});
     if(!row)throw new NotFoundException('Blueprint release not found');
     if(row.status==='REVOKED')return{...this.dagReleaseProjection(row),replayed:true};
     const change=await tx.blueprintDeployment.updateMany({where:{
      id,organizationId,status:row.status},
      data:{status:'REVOKED',revokedBy:identity.userId,revokedAt:new Date()}});
     if(change.count!==1)throw new ConflictException('Concurrent blueprint revocation');
     await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
      actorId:identity.userId,action:'DAG_RELEASE_REVOKED',
      objectType:'BlueprintDeployment',objectId:id,correlationId:id,
      after:{reason,externalEffectsAuthorized:false}}});
     await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
      eventType:'OfflineDagReleaseRevokedInternal',aggregateType:'BlueprintDeployment',
      aggregateId:id,version:row.revision,correlationId:id,
      payload:{reason,revoked:true,externalEffectsAuthorized:false}}});
     return{...this.dagReleaseProjection(await tx.blueprintDeployment.findFirstOrThrow({
      where:{id,organizationId}})),replayed:false};
    });
  }
  /** Pinned immutable definition + all PENDING steps in canonical workflow ledger. */
  async dagLaunch(organizationId:string,identity:VerifiedIdentity,input:{
   blueprintId?:unknown;requestKey?:unknown;objective?:unknown;market?:unknown
  }){
    this.dagEnabled();
    const blueprintId=this.dagId(input?.blueprintId);
    const requestKey=this.dagId(input?.requestKey);
    if(requestKey.length<12)
     throw new BadRequestException('Launch idempotency key needs 12+ characters');
    const objective=typeof input?.objective==='string'?input.objective.trim():'';
    const market=typeof input?.market==='string'?input.market.trim():'';
    if(objective.length<3||objective.length>1000||market.length>120)
     throw new BadRequestException('Bounded objective and market required');
    const correlationId='r3g-'+createHash('sha256').update(JSON.stringify([
     'medsol-r3g-run-v1',organizationId,blueprintId,requestKey
    ])).digest('hex');
    return this.dagTransaction(organizationId,async tx=>{
     await this.dagAuthorize(tx,organizationId,identity,'EXECUTE_WORKFLOW');
     const existing=await tx.workflowExecution.findFirst({where:{
      organizationId,workflowType:'BLUEPRINT_OFFLINE_DAG',correlationId}});
     if(existing){
      const previous=existing.input as {objective?:string;market?:string};
      if(previous?.objective!==objective||previous?.market!==market)
       throw new ConflictException('Workflow key reused with different input');
      return{workflowExecutionId:existing.id,status:existing.status,
       replayed:true,externalEffectsAuthorized:false as const};
     }
     const release=await tx.blueprintDeployment.findFirst({where:{
      organizationId,blueprintId,status:'ACTIVE'}});
     if(!release)throw new ConflictException('No active approved offline blueprint');
     const manifest=parseOfflineDagManifest(release.manifest);
     if(offlineDagDigest(manifest)!==release.digest||
      !verifyOfflineDagSignature(manifest,release.signature,
       release.signerKeyId,offlineDagTrust()))
      throw new ForbiddenException('Active blueprint signature untrusted');
     if(!canaryAllows(organizationId,blueprintId,requestKey,manifest.canaryPercent))
      return{workflowExecutionId:null,status:'CANARY_NOT_SELECTED' as const,
       replayed:false,externalEffectsAuthorized:false as const};
     const plan=planOfflineDag(manifest);
     const agentIds=[...new Set(plan.map(s=>s.agentId).filter((x):x is string=>!!x))];
     const installed=await tx.agent.findMany({where:{
      organizationId,id:{in:agentIds}},select:{id:true,version:true,status:true}});
     const agentPins:Record<string,number>=Object.fromEntries(agentIds.map(id=>{
      const row=installed.find(a=>a.id===id);
      if(row&&row.status!=='ACTIVE')
       throw new ForbiddenException('Referenced canonical agent is administratively disabled');
      return[id,row?.version??1];
     }));
     const row=await tx.workflowExecution.create({data:{
      id:randomUUID(),organizationId,workflowType:'BLUEPRINT_OFFLINE_DAG',
      correlationId,status:'RUNNING',currentStep:'QUEUED',
      input:{blueprintId,requestKey,objective,market,requestedBy:identity.userId,
       deploymentId:release.id,releaseDigest:release.digest,revision:release.revision,
       agentPins,knowledgeMode:process.env.MARKETING_DAG_KNOWLEDGE_ENABLED==='true'?
        'CITATIONS_REQUIRED':'DISABLED',offlineOnly:true,externalEffectsAuthorized:false}
     }});
     await tx.workflowStepExecution.createMany({data:plan.map(step=>({
      organizationId,workflowExecutionId:row.id,stepKey:step.id,status:'PENDING',
      input:{type:step.type,agentId:step.agentId,order:step.order,
       predecessorKeys:step.predecessors,externalEffectsAuthorized:false}
     }))});
     await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
      actorId:identity.userId,action:'DAG_OFFLINE_RUN_LAUNCHED',
      objectType:'WorkflowExecution',objectId:row.id,correlationId,
      after:{blueprintId,revision:release.revision,steps:plan.length,
       externalEffectsAuthorized:false}}});
     return{workflowExecutionId:row.id,status:'RUNNING' as const,
      replayed:false,externalEffectsAuthorized:false as const};
    });
  }
  async dagTick(organizationId:string,identity:VerifiedIdentity,idInput:unknown){
    this.dagEnabled();
    const id=this.dagId(idInput);
    await this.dagTransaction(organizationId,tx=>
     this.dagAuthorize(tx,organizationId,identity,'EXECUTE_WORKFLOW'));
    const lease=await this.leases.claim(organizationId,id,300000);
    try{
      for(let iteration=0;iteration<20;iteration++){
        await this.leases.assertActive(lease);
        const action=await this.dagTransaction(organizationId,async tx=>{
          const wf=await tx.workflowExecution.findFirst({where:{
           id,organizationId,workflowType:'BLUEPRINT_OFFLINE_DAG'}});
          if(!wf||wf.status!=='RUNNING'||wf.leaseOwner!==lease.owner||
             wf.leaseGeneration!==lease.generation||
             !wf.leaseExpiresAt||wf.leaseExpiresAt<=new Date())
            throw new ConflictException('DAG lease, status or execution fence changed');
          const meta=wf.input as {deploymentId?:string;releaseDigest?:string;
           blueprintId?:string;objective?:string;market?:string;
           requestedBy?:string;agentPins?:Record<string,number>;
           knowledgeMode?:string};
          const release=await tx.blueprintDeployment.findFirst({where:{
           organizationId,id:meta.deploymentId??''}});
          if(!release||release.status==='REVOKED'||release.digest!==meta.releaseDigest||
             offlineDagDigest(release.manifest)!==release.digest||
             !verifyOfflineDagSignature(release.manifest,release.signature,
              release.signerKeyId,offlineDagTrust())){
            await tx.workflowExecution.updateMany({where:{id,organizationId,
             leaseOwner:lease.owner,leaseGeneration:lease.generation,status:'RUNNING'},
             data:{status:'BLOCKED',currentStep:'RELEASE_REVOKED_OR_UNTRUSTED',
              error:{releaseRevokedOrUntrusted:true,externalEffectsAuthorized:false},
              completedAt:new Date(),version:{increment:1}}});
            return{kind:'BLOCKED' as const};
          }
          const plan=planOfflineDag(release.manifest);
          const steps=await tx.workflowStepExecution.findMany({where:{
           workflowExecutionId:id,organizationId}});
          const ledger=new Map(steps.map(s=>[s.stepKey,s]));
          if(steps.length!==plan.length||steps.some(s=>!plan.some(p=>p.id===s.stepKey)))
           throw new ConflictException('Durable DAG step ledger differs from pinned graph');
          const ready=plan.find(step=>ledger.get(step.id)?.status!=='COMPLETED'&&
           step.predecessors.every(p=>ledger.get(p)?.status==='COMPLETED'));
          if(!ready){
           if(steps.every(s=>s.status==='COMPLETED')){
            await tx.workflowExecution.updateMany({where:{id,organizationId,
             leaseOwner:lease.owner,leaseGeneration:lease.generation,status:'RUNNING'},
             data:{status:'COMPLETED',currentStep:'END',completedAt:new Date(),
              output:{complete:true,offlineOnly:true,externalEffectsAuthorized:false},
              version:{increment:1}}});
            return{kind:'COMPLETED' as const};
           }
           throw new ConflictException('Workflow is deadlocked or has inconsistent join');
          }
          const current=ledger.get(ready.id)!;
          if(current.status!=='PENDING'){
           // A crashed AGENT_TASK may have produced an internal decision.
           // Never blindly rerun an in-flight or unknown task.
           await tx.workflowExecution.updateMany({where:{id,organizationId,
            leaseOwner:lease.owner,leaseGeneration:lease.generation,status:'RUNNING'},
            data:{status:'BLOCKED',currentStep:ready.id,
             error:{reason:'UNCERTAIN_STEP_OUTCOME_MANUAL_REVIEW',stepKey:ready.id},
             completedAt:new Date(),version:{increment:1}}});
           return{kind:'BLOCKED' as const};
          }
          if(ready.type==='HUMAN_TASK'||ready.type==='APPROVAL'){
           const approval=await tx.approval.create({data:{
            organizationId,objectType:'BlueprintWorkflowStep',objectId:ready.id,
            requiredAuthority:'HUMAN',riskLevel:'R2',decision:'PENDING',
            requestedBy:meta.requestedBy??null,workflowExecutionId:id,
            scopeDigest:release.digest,
            scope:{deploymentId:release.id,releaseDigest:release.digest,
             stepId:current.id,nodeId:ready.id,
             externalEffectsAuthorized:false}
           }});
           await tx.workflowStepExecution.updateMany({where:{
            id:current.id,organizationId,status:'PENDING'},data:{
            status:'WAITING_APPROVAL',output:{approvalId:approval.id},
            completedAt:null}});
           await tx.workflowExecution.updateMany({where:{id,organizationId,
            leaseOwner:lease.owner,leaseGeneration:lease.generation,status:'RUNNING'},
            data:{status:'WAITING_APPROVAL',currentStep:ready.id,
             version:{increment:1}}});
           await tx.auditEvent.create({data:{organizationId,actorType:'SYSTEM',
            actorId:'r3g-canonical-workflow',action:'DAG_WAITING_INDEPENDENT_HUMAN',
            objectType:'WorkflowExecution',objectId:id,correlationId:wf.correlationId,
            after:{stepKey:ready.id,approvalId:approval.id,
             externalEffectsAuthorized:false}}});
           return{kind:'WAITING_APPROVAL' as const,approvalId:approval.id,
            stepKey:ready.id};
          }
          if(ready.type==='AGENT_TASK'){
           if(process.env.MARKETING_AI_REASONING_ENABLED==='true')
            throw new ForbiddenException('Remote model enabled; offline DAG cannot run');
           const agentId=ready.agentId!;
           const pin=meta.agentPins?.[agentId];
           const installed=await tx.agent.findFirst({where:{
            organizationId,id:agentId},select:{version:true,status:true}});
           if(!Number.isSafeInteger(pin)||(installed?.version??1)!==pin||
              (installed&&installed.status!=='ACTIVE'))
            throw new ConflictException('Pinned agent manifest version has changed');
           const claimed=await tx.workflowStepExecution.updateMany({where:{
            id:current.id,organizationId,status:'PENDING'},data:{
            status:'RUNNING',startedAt:new Date()}});
           if(claimed.count!==1)throw new ConflictException('Concurrent agent step claim');
           await tx.workflowExecution.updateMany({where:{id,organizationId,
            leaseOwner:lease.owner,leaseGeneration:lease.generation,status:'RUNNING'},
            data:{currentStep:ready.id,version:{increment:1}}});
           return{kind:'AGENT_TASK' as const,stepId:current.id,
            agentId,objective:meta.objective??'',market:meta.market??'',
            correlationId:wf.correlationId,knowledgeMode:meta.knowledgeMode??'DISABLED'};
          }
          const claimed=await tx.workflowStepExecution.updateMany({where:{
           id:current.id,organizationId,status:'PENDING'},data:{
           status:'COMPLETED',completedAt:new Date(),
           output:{controlNode:ready.type,offlineOnly:true,externalEffectsAuthorized:false}}});
          if(claimed.count!==1)throw new ConflictException('Concurrent control node');
          await tx.workflowExecution.updateMany({where:{id,organizationId,
           leaseOwner:lease.owner,leaseGeneration:lease.generation,status:'RUNNING'},
           data:{currentStep:ready.id,version:{increment:1}}});
          return{kind:'CONTINUE' as const};
        });
        if(action.kind==='BLOCKED'||action.kind==='COMPLETED'||
           action.kind==='WAITING_APPROVAL')
          return{workflowExecutionId:id,status:action.kind,
           ...(action.kind==='WAITING_APPROVAL'?{
            stepKey:action.stepKey,approvalId:action.approvalId}:{}),
           externalEffectsAuthorized:false};
        if(action.kind==='AGENT_TASK'){
          try{
           const capability=SAFE_DAG_CAPABILITY[action.agentId];
           if(!capability)throw new ForbiddenException('Agent capability not in offline allowlist');
           let evidence:ReturnType<typeof curateDagEvidence>|null=null;
           if(action.knowledgeMode==='CITATIONS_REQUIRED'){
            if(process.env.MARKETING_DAG_KNOWLEDGE_ENABLED!=='true'||!this.learning)
             throw new ForbiddenException('Signed DAG knowledge policy disabled or unavailable');
            const retrieved=await this.learning.contextForAgent(organizationId,
             action.agentId,action.objective.slice(0,400));
            evidence=curateDagEvidence(retrieved,action.agentId);
           }else if(action.knowledgeMode!=='DISABLED')
            throw new ForbiddenException('Unknown pinned DAG knowledge policy');
           const result=await this.agents.execute(action.agentId,{
            organizationId,correlationId:action.correlationId,
            causationId:id,input:{objective:action.objective,
             // Market is optional at DAG launch. The deterministic domain
             // engine requires a nonempty context; an explicit unresolved
             // marker is safer than inventing a geographic market or failing
             // halfway through an agent task after its durable claim.
             market:action.market.trim()||'Unspecified market; human review required',
             requestedOutcome:action.objective,
             ...(evidence?{knowledgeContext:evidence.context}:{})},
            capabilities:[capability]});
           await this.leases.assertActive(lease);
           await this.dagCheckpointAgentStep(lease,action.stepId,
            action.agentId,result.executionId,result.decision.action,
            result.decision.approvalRequired,evidence?.refs??[]);
          }catch(error){
           // Losing the lease must not corrupt a successor's state.
           // A current owner quarantines uncertain outcomes atomically.
           try{await this.dagQuarantineAgentStep(lease,action.stepId);}
           catch(quarantineError){
            if(!(quarantineError instanceof ConflictException))throw quarantineError;
           }
           throw error;
          }
        }
      }
      return{workflowExecutionId:id,status:'RUNNING',batchLimitReached:true,
       externalEffectsAuthorized:false};
    }finally{await this.leases.release(lease);}
  }

  /**
   * R3-J crash-window checkpoint. The worker's in-memory lease assertion is
   * insufficient: fence verification, completed AgentExecution proof, and the
   * step ledger write MUST share a locked PostgreSQL transaction. This keeps
   * the single canonical workflow ledger authoritative, even across workers.
   */
  private async dagCheckpointAgentStep(lease:WorkflowLease,stepId:string,
    agentId:string,executionId:string,action:string,reviewRequired:boolean,
    evidenceRefs:DagEvidenceRef[]=[]){
    if(process.env.MARKETING_DAG_OFFLINE_EXECUTION_ENABLED!=='true'||
       process.env.MARKETING_AI_REASONING_ENABLED==='true')
     throw new ForbiddenException('Offline-only DAG runtime gate changed before checkpoint');
    return this.dagTransaction(lease.organizationId,async tx=>{
      const locked=await tx.$queryRaw<Array<{id:string}>>`
       SELECT "id" FROM "WorkflowExecution"
       WHERE "id"=${lease.workflowId} AND "organizationId"=${lease.organizationId}
       FOR UPDATE`;
      if(locked.length!==1)
       throw new ConflictException('Fenced DAG workflow no longer exists');
      const now=new Date();
      const wf=await tx.workflowExecution.findFirst({where:{
       id:lease.workflowId,organizationId:lease.organizationId,
       workflowType:'BLUEPRINT_OFFLINE_DAG',status:'RUNNING',
       leaseOwner:lease.owner,leaseGeneration:lease.generation,
       leaseExpiresAt:{gt:now}
      }});
      if(!wf)throw new ConflictException('DAG agent checkpoint lease superseded or expired');
      const meta=wf.input as {deploymentId?:string;releaseDigest?:string;
       agentPins?:Record<string,number>;knowledgeMode?:string};
      const release=await tx.blueprintDeployment.findFirst({where:{
       organizationId:lease.organizationId,id:meta.deploymentId??'',
       status:{not:'REVOKED'}
      }});
      if(!release||release.digest!==meta.releaseDigest||
       offlineDagDigest(release.manifest)!==release.digest||
       !verifyOfflineDagSignature(release.manifest,release.signature,
        release.signerKeyId,offlineDagTrust()))
       throw new ConflictException('DAG release revoked or signature untrusted at checkpoint');
      const installed=await tx.agent.findFirst({where:{
       organizationId:lease.organizationId,id:agentId},select:{
        version:true,status:true}});
      if(!Number.isSafeInteger(meta.agentPins?.[agentId])||
       (installed?.version??1)!==meta.agentPins?.[agentId]||
       (installed&&installed.status!=='ACTIVE'))
       throw new ConflictException('Pinned agent release changed before checkpoint');
      const execution=await tx.agentExecution.findFirst({where:{
       id:executionId,organizationId:lease.organizationId,agentId,
       correlationId:wf.correlationId,causationId:lease.workflowId,
       status:'COMPLETED'
      },select:{id:true,decision:true}});
      const decision=execution?.decision as {releaseEvidence?:{
       modelCallsAuthorized?:boolean;toolCallsAuthorized?:boolean;
       externalEffectsAuthorized?:boolean}}|null|undefined;
      if(meta.knowledgeMode==='CITATIONS_REQUIRED'){
       if(process.env.MARKETING_DAG_KNOWLEDGE_ENABLED!=='true')
        throw new ConflictException('Pinned knowledge gate changed during execution');
       await assertDagEvidenceCurrent(tx,lease.organizationId,evidenceRefs);
      }else if(evidenceRefs.length)
       throw new ConflictException('Unpinned knowledge is not permitted in DAG checkpoint');
      if(!execution||decision?.releaseEvidence?.modelCallsAuthorized!==false||
       decision?.releaseEvidence?.toolCallsAuthorized!==false||
       decision?.releaseEvidence?.externalEffectsAuthorized!==false)
       throw new ConflictException('Completed no-egress agent execution proof missing');
      const changed=await tx.workflowStepExecution.updateMany({where:{
       id:stepId,organizationId:lease.organizationId,
       workflowExecutionId:lease.workflowId,status:'RUNNING'
      },data:{status:'COMPLETED',completedAt:now,output:{
       agentExecutionId:executionId,action,reviewRequired,
       releaseDigest:release.digest,leaseGeneration:lease.generation,
       evidenceRefs,knowledgeMode:meta.knowledgeMode??'DISABLED',
       externalEffectsAuthorized:false}}});
      if(changed.count!==1)
       throw new ConflictException('DAG agent checkpoint already decided');
      await tx.auditEvent.create({data:{
       organizationId:lease.organizationId,actorType:'SYSTEM',
       actorId:'r3j-fenced-dag-checkpoint',action:'DAG_AGENT_FENCED_CHECKPOINT',
       objectType:'WorkflowExecution',objectId:lease.workflowId,
       correlationId:wf.correlationId,causationId:executionId,
       after:{stepId,agentId,executionId,
        leaseGeneration:lease.generation,releaseDigest:release.digest,
        evidenceReferences:evidenceRefs.length,externalEffectsAuthorized:false}
      }});
      return{stepId,status:'COMPLETED' as const,executionId};
    });
  }
  /**
   * Ambiguous completions are quarantined only by the STILL-CURRENT lease
   * holder. Stale owners cannot overwrite a successor's live step ledger.
   * No automatic retry or detached remote effect is attempted.
   */
  private async dagQuarantineAgentStep(lease:WorkflowLease,stepId:string){
    return this.dagTransaction(lease.organizationId,async tx=>{
      const locked=await tx.$queryRaw<Array<{id:string}>>`
       SELECT "id" FROM "WorkflowExecution"
       WHERE "id"=${lease.workflowId} AND "organizationId"=${lease.organizationId}
       FOR UPDATE`;
      if(locked.length!==1)return{quarantined:false};
      const wf=await tx.workflowExecution.findFirst({where:{
       id:lease.workflowId,organizationId:lease.organizationId,
       workflowType:'BLUEPRINT_OFFLINE_DAG',status:'RUNNING',
       leaseOwner:lease.owner,leaseGeneration:lease.generation,
       leaseExpiresAt:{gt:new Date()}
      }});
      if(!wf)return{quarantined:false};
      const step=await tx.workflowStepExecution.updateMany({where:{
       id:stepId,organizationId:lease.organizationId,
       workflowExecutionId:lease.workflowId,status:'RUNNING'
      },data:{status:'OUTCOME_UNKNOWN',completedAt:new Date(),
       error:{reason:'Agent task requires manual recovery review',
        automaticReplayAllowed:false}}});
      if(step.count!==1)return{quarantined:false};
      const changed=await tx.workflowExecution.updateMany({where:{
       id:lease.workflowId,organizationId:lease.organizationId,
       leaseOwner:lease.owner,leaseGeneration:lease.generation,
       status:'RUNNING'},data:{status:'BLOCKED',
        currentStep:'UNCERTAIN_AGENT_STEP',completedAt:new Date(),
        version:{increment:1}}});
      if(changed.count!==1)
       throw new ConflictException('Agent quarantine lease changed');
      await tx.auditEvent.create({data:{
       organizationId:lease.organizationId,actorType:'SYSTEM',
       actorId:'r3j-fenced-dag-checkpoint',action:'DAG_AGENT_OUTCOME_UNKNOWN',
       objectType:'WorkflowExecution',objectId:lease.workflowId,
       correlationId:wf.correlationId,
       after:{stepId,leaseGeneration:lease.generation,
        automaticReplayAllowed:false,externalEffectsAuthorized:false}
      }});
      return{quarantined:true};
    });
  }

  /**
   * R3-J operator-only evidence for an uncertain offline DAG. Every fact is
   * read from the existing workflow, approval, deployment, agent and audit
   * ledgers; the report never retries or silently repairs an execution.
   */
  async dagRecoveryEvidence(organizationId:string,identity:VerifiedIdentity,
    rawId:unknown){
    const id=this.dagId(rawId);
    return this.dagTransaction(organizationId,async tx=>{
      await this.dagAuthorize(tx,organizationId,identity,'READ_AUDIT');
      const workflow=await tx.workflowExecution.findFirst({where:{
       id,organizationId,workflowType:'BLUEPRINT_OFFLINE_DAG'}});
      if(!workflow)throw new NotFoundException('Offline DAG run not found in tenant');
      const meta=workflow.input as {
       deploymentId?:string;releaseDigest?:string;revision?:number
      };
      const release=await tx.blueprintDeployment.findFirst({where:{
       organizationId,id:meta.deploymentId??''
      }});
      const releaseTrusted=!!release&&release.status!=='REVOKED'&&
       release.digest===meta.releaseDigest&&
       offlineDagDigest(release.manifest)===release.digest&&
       verifyOfflineDagSignature(release.manifest,release.signature,
        release.signerKeyId,offlineDagTrust());
      const steps=await tx.workflowStepExecution.findMany({where:{
       organizationId,workflowExecutionId:id
      },orderBy:{startedAt:'asc'},take:40});
      const approvalRows=await tx.approval.findMany({where:{
       organizationId,workflowExecutionId:id,objectType:'BlueprintWorkflowStep'
      },orderBy:{createdAt:'asc'},take:40,
       select:{id:true,objectId:true,decision:true,decidedBy:true}});
      const agentRows=await tx.agentExecution.findMany({where:{
       organizationId,causationId:id,correlationId:workflow.correlationId
      },select:{id:true,agentId:true,status:true,completedAt:true},
       orderBy:{startedAt:'asc'},take:100});
      const leaseExpired=!workflow.leaseExpiresAt||
       workflow.leaseExpiresAt<=new Date();
      const suspiciousSteps=steps.filter(x=>
       ['RUNNING','OUTCOME_UNKNOWN','FAILED','BLOCKED'].includes(x.status));
      const code=!releaseTrusted?'RELEASE_REVOKED_OR_UNTRUSTED':
       suspiciousSteps.length?'UNCERTAIN_STEP_REVIEW_REQUIRED':
       workflow.status==='BLOCKED'?'BLOCKED_MANUAL_REVIEW':
       workflow.status==='WAITING_APPROVAL'?'PENDING_INDEPENDENT_APPROVAL':
       workflow.status==='RUNNING'&&leaseExpired?'LEASE_EXPIRED_INSPECT_FIRST':
       workflow.status==='RUNNING'?'ACTIVE_LEASE_DO_NOT_TAKE_OVER':
       workflow.status==='COMPLETED'?'NO_REPLAY_REQUIRED':
       'UNEXPECTED_STATE_MANUAL_REVIEW';
      return{
       workflowExecutionId:id,organizationId,status:workflow.status,
       correlationId:workflow.correlationId,revision:meta.revision??null,
       release:{deploymentId:meta.deploymentId??null,
        digest:meta.releaseDigest??null,
        status:release?.status??'MISSING',signatureTrusted:releaseTrusted},
       lease:{generation:workflow.leaseGeneration,
        leaseHeld:!!workflow.leaseOwner&&!leaseExpired,
        expired:leaseExpired,expiresAt:workflow.leaseExpiresAt},
       steps:steps.map(step=>({stepKey:step.stepKey,status:step.status,
        startedAt:step.startedAt,completedAt:step.completedAt})),
       approvals:approvalRows,agentProofs:agentRows,
       evidenceStatus:code,unresolvedSteps:suspiciousSteps.length,
       truncated:{steps:steps.length>=40,agents:agentRows.length>=100},
       automaticReplayAllowed:false,directStepResumeAllowed:false,
       outputCertified:false,externalEffectsAuthorized:false,
       requiredOperatorAction:code==='NO_REPLAY_REQUIRED'?
        'Review completed workflow evidence; no recovery needed':
        'Investigate authoritative step and agent execution evidence; no automatic replay or manual SQL rewrite'
      };
    });
  }

  /** Called by the canonical ApprovalService only after its own durable human decision. */
  private async dagReconcileApproval(organizationId:string,approvalId:string,
   decision:'APPROVED'|'REJECTED'){
    await this.dagTransaction(organizationId,async tx=>{
     const approval=await tx.approval.findFirst({where:{organizationId,
      id:approvalId,objectType:'BlueprintWorkflowStep',
      decision,workflowExecutionId:{not:null}}});
     if(!approval?.workflowExecutionId)return;
     const wf=await tx.workflowExecution.findFirst({where:{
      organizationId,id:approval.workflowExecutionId,
      workflowType:'BLUEPRINT_OFFLINE_DAG',status:'WAITING_APPROVAL'}});
     if(!wf)return;
     const step=await tx.workflowStepExecution.findFirst({where:{
      organizationId,workflowExecutionId:wf.id,stepKey:approval.objectId,
      status:'WAITING_APPROVAL'}});
     if(!step||approval.scopeDigest!==(wf.input as {releaseDigest?:string}).releaseDigest)
      throw new ConflictException('Human approval does not match pinned DAG step and digest');
     // A crash can separate the approval command receipt and its downstream
     // workflow reconciliation. Recheck the release in THIS transaction;
     // replaying an old APPROVED receipt must never revive revoked code.
     const meta=wf.input as {deploymentId?:string;releaseDigest?:string};
     const release=decision==='APPROVED'?await tx.blueprintDeployment.findFirst({
      where:{organizationId,id:meta.deploymentId??''}
     }):null;
     let releaseTrusted=decision!=='APPROVED';
     if(decision==='APPROVED'){
      try{
       releaseTrusted=!!release&&release.status!=='REVOKED'&&
        release.digest===meta.releaseDigest&&
        offlineDagDigest(release.manifest)===release.digest&&
        verifyOfflineDagSignature(release.manifest,release.signature,
         release.signerKeyId,offlineDagTrust());
      }catch{releaseTrusted=false;}
     }
     const permitted=decision==='APPROVED'&&releaseTrusted;
     await tx.workflowStepExecution.updateMany({where:{id:step.id,
      organizationId,status:'WAITING_APPROVAL'},data:{
      status:permitted?'COMPLETED':'BLOCKED',
      completedAt:new Date(),
      output:{approvalId,decision,
       revokedAfterHumanDecision:decision==='APPROVED'&&!releaseTrusted,
       externalEffectsAuthorized:false}}});
     await tx.workflowExecution.updateMany({where:{id:wf.id,organizationId,
      status:'WAITING_APPROVAL'},data:{
      status:permitted?'RUNNING':'BLOCKED',
      currentStep:permitted?approval.objectId:'REVOKED_RELEASE_APPROVAL_RECONCILIATION',
      ...(!permitted?{completedAt:new Date()}:{}),
      version:{increment:1}}});
     if(decision==='APPROVED'&&!releaseTrusted)
      await tx.auditEvent.create({data:{organizationId,actorType:'SYSTEM',
       actorId:'r3j-fenced-approval-reconciliation',
       action:'DAG_APPROVAL_RECEIPT_QUARANTINED',
       objectType:'WorkflowExecution',objectId:wf.id,
       correlationId:wf.correlationId,
       after:{approvalId,revokedAfterHumanDecision:true,
        automaticReplayAllowed:false,externalEffectsAuthorized:false}}});
    });
  }

  async start(request: MarketingRequest,authenticatedInitiatorId?:string): Promise<WorkflowResult> {
    // Only the Nest OIDC guard supplies this optional human ID. Never trust a
    // requestedBy or initiator from the untrusted workflow request body.
    // The persisted workflow input owns provenance across crash/recovery.
    if(authenticatedInitiatorId){
      const author=await withMarketingTenant(this.db,request.organizationId,tx=>
        tx.user.findFirst({where:{id:authenticatedInitiatorId,
          organizationId:request.organizationId,disabledAt:null},
          select:{id:true}}));
      if(!author)throw new ForbiddenException('Authenticated workflow initiator not provisioned in tenant');
    }
    const correlationId = randomUUID();
    const input={...request,...(authenticatedInitiatorId?{
      initiatedBy:authenticatedInitiatorId
    }:{})};
    const workflow = await withMarketingTenant(this.db,request.organizationId,tx=>tx.workflowExecution.create({
      data:{organizationId:request.organizationId,workflowType:'MARKETING_CAMPAIGN_LIFECYCLE',
        currentStep:'CMO_ASSESSMENT',correlationId,input}
    }));
    return this.runWithLease(workflow.id,request,correlationId,authenticatedInitiatorId);
  }

  async resume(id: string, organizationId: string): Promise<WorkflowResult> {
    const workflow = await withMarketingTenant(this.db,organizationId,tx=>tx.workflowExecution.findFirst({ where: { id, organizationId } }));
    if (!workflow) throw new NotFoundException('Workflow execution not found in tenant');
    if (['WAITING_APPROVAL', 'COMPLETED', 'BLOCKED', 'CANCELLED'].includes(workflow.status)) {
      return { workflowExecutionId: workflow.id, status: workflow.status, currentStep: workflow.currentStep, correlationId: workflow.correlationId, output: workflow.output ?? undefined };
    }
    if (workflow.status === 'RUNNING') throw new ConflictException('RUNNING recovery is disabled until all external side effects are fenced');
    const claimed = await withMarketingTenant(this.db,organizationId,tx=>tx.workflowExecution.updateMany({
      where: { id, organizationId, status: 'FAILED', version: workflow.version },
      data: { status: 'RUNNING', currentStep: 'RECOVERING', completedAt: null, version: { increment: 1 } }
    }));
    if (claimed.count !== 1) throw new ConflictException('Workflow recovery already claimed');
    const owner=(workflow.input as {initiatedBy?:unknown})?.initiatedBy;
    const originalHuman=typeof owner==='string'&&owner.length>0?owner:undefined;
    return this.runWithLease(workflow.id,MarketingRequestSchema.parse(workflow.input),
      workflow.correlationId,originalHuman);
  }

  private async runWithLease(workflowId: string, request: MarketingRequest, correlationId: string,originalHuman?:string): Promise<WorkflowResult> {
    const lease = await this.leases.claim(request.organizationId, workflowId, 300000);
    try { return await this.execute(workflowId, request, correlationId, lease,originalHuman); }
    finally { await this.leases.release(lease); }
  }

  private async execute(workflowId: string, request: MarketingRequest, correlationId: string, lease: WorkflowLease,originalHuman?:string): Promise<WorkflowResult> {
    try {
      const cmo = await this.step(workflowId, lease, 'CMO_ASSESSMENT', request, () => this.agents.execute('MKT-CMO-001', { organizationId: request.organizationId, correlationId, input: request, capabilities: ['ASSESS_OBJECTIVE'] }));
      const strategy = await this.step(workflowId, lease, 'STRATEGY_ASSESSMENT', { request, cmo: cmo.decision.payload }, () => this.agents.execute('MKT-STR-001', { organizationId: request.organizationId, correlationId, causationId: cmo.executionId, input: { request, cmo: cmo.decision.payload }, capabilities: ['ASSESS_MARKET'] }));
      if (!request.objectiveId) return this.finish(workflowId, lease, 'OBJECTIVE_REQUIRED', { cmo: cmo.decision.payload, strategy: strategy.decision.payload, nextAction: 'Provide objectiveId before campaign creation.' });
      const code = 'MKT-' + Date.now().toString(36).toUpperCase() + '-' + randomUUID().slice(0, 6).toUpperCase();
      const campaign = await this.step(workflowId, lease, 'CAMPAIGN_CREATION', { request, strategy: strategy.decision.payload }, () => this.campaigns.create({ commandId: workflowId + ':CAMPAIGN_CREATION', correlationId, organizationId: request.organizationId, objectiveId: request.objectiveId!, productId: request.productId, brandId: request.brandId, code, name: request.requestedOutcome, riskLevel: 'R2' },originalHuman));
      const transitions = [['ASSESSMENT', 'CAMPAIGN_ASSESSMENT'], ['PROPOSED', 'CAMPAIGN_PROPOSAL'], ['APPROVAL_PENDING', 'APPROVAL_GATE']] as const;
      let last = campaign;
      for (const [to, stepKey] of transitions) {
        const currentVersion = (last as { version: number }).version;
        last = await this.step(workflowId, lease, stepKey, last, () => this.campaigns.transition({ commandId: workflowId + ':' + stepKey, correlationId, organizationId: request.organizationId, campaignId: (campaign as {campaignId:string}).campaignId, to, expectedVersion: currentVersion, workflowExecutionId: workflowId },originalHuman));
      }
      await this.leases.assertActive(lease);
      const waiting = await withMarketingTenant(this.db,request.organizationId,tx=>tx.workflowExecution.updateMany({ where: { id: workflowId, organizationId: request.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { status: 'WAITING_APPROVAL', currentStep: 'APPROVAL_GATE', output: { campaign: last, workflow: 'WAITING_FOR_HUMAN_APPROVAL' } as any, version: { increment: 1 } } }));
      if (waiting.count !== 1) throw new ConflictException('Workflow lease lost before approval transition');
      return { workflowExecutionId: workflowId, status: 'WAITING_APPROVAL', currentStep: 'APPROVAL_GATE', correlationId, output: { campaign: last, message: 'Campaign is waiting for human approval.' } };
    } catch (error) {
      await withMarketingTenant(this.db,request.organizationId,tx=>tx.workflowExecution.updateMany({ where: { id: workflowId, organizationId: request.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { status: 'FAILED', currentStep: 'FAILED', error: { message: error instanceof Error ? error.message : 'Unknown error' } as any, completedAt: new Date(), version: { increment: 1 } } }));
      throw error;
    }
  }

  async completeAfterApproval(workflowExecutionId: string | null, organizationId: string, approval: unknown): Promise<void> {
    if (!workflowExecutionId) return;
    const workflow = await withMarketingTenant(this.db,organizationId,tx=>tx.workflowExecution.findFirst({ where: { id: workflowExecutionId, organizationId, status: 'WAITING_APPROVAL' } }));
    if (!workflow) return;
    if(workflow.workflowType==='BLUEPRINT_OFFLINE_DAG'){
      const approvalId=(approval as {approvalId?:unknown})?.approvalId;
      if(typeof approvalId!=='string')throw new ConflictException('Durable workflow approval identity missing');
      await this.dagReconcileApproval(organizationId,approvalId,'APPROVED');
      return;
    }
    await this.completeWorkflow(organizationId,workflow.id, 'APPROVAL_COMPLETED', approval, 'COMPLETED');
  }

  async blockAfterApprovalRejection(approvalId: string, organizationId: string, rationale: string): Promise<void> {
    const approval = await withMarketingTenant(this.db,organizationId,tx=>tx.approval.findFirst({ where: { id: approvalId, organizationId } }));
    if (!approval?.workflowExecutionId) return;
    const workflowExecutionId=approval.workflowExecutionId;
    const workflow = await withMarketingTenant(this.db,organizationId,tx=>tx.workflowExecution.findFirst({ where: { id: workflowExecutionId, organizationId, status: 'WAITING_APPROVAL' } }));
    if (!workflow) return;
    if(workflow.workflowType==='BLUEPRINT_OFFLINE_DAG'){
      await this.dagReconcileApproval(organizationId,approvalId,'REJECTED');
      return;
    }
    await this.completeWorkflow(organizationId,workflow.id, 'APPROVAL_REJECTED', { approvalId, rationale, blocked: true }, 'BLOCKED');
  }

  private async completeWorkflow(organizationId:string,id: string, stepKey: string, output: unknown, status: 'COMPLETED' | 'BLOCKED'): Promise<void> {
    await withMarketingTenant(this.db,organizationId,async tx => {
      const workflow = await tx.workflowExecution.findFirst({ where: { id, organizationId, status: 'WAITING_APPROVAL' } });
      if (!workflow) return;
      await tx.workflowExecution.updateMany({ where: { id: workflow.id, organizationId, status: 'WAITING_APPROVAL' }, data: { status, currentStep: stepKey, output: output as any, completedAt: new Date(), version: { increment: 1 } } });
      await tx.workflowStepExecution.updateMany({ where: { organizationId,workflowExecutionId: workflow.id, stepKey: 'APPROVAL_GATE', status: 'RUNNING' }, data: { status: 'COMPLETED', output: output as any, completedAt: new Date() } });
    });
  }

  async get(id: string, organizationId: string): Promise<unknown> {
    const workflow = await withMarketingTenant(this.db,organizationId,tx=>tx.workflowExecution.findFirst({ where: { id, organizationId }, include: { steps: { orderBy: { startedAt: 'asc' } } } }));
    if (!workflow) throw new NotFoundException('Workflow execution not found in tenant');
    return workflow;
  }

  private async step<T>(workflowId: string, lease: WorkflowLease, stepKey: string, input: unknown, run: () => Promise<T>): Promise<T> {
    await this.leases.assertActive(lease);
    const existing = await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowStepExecution.findUnique({ where: { workflowExecutionId_stepKey: { workflowExecutionId: workflowId, stepKey } } }));
    if (existing?.status === 'COMPLETED') return existing.output as T;
    if (existing?.status === 'FAILED') await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowStepExecution.update({ where: { id: existing.id }, data: { status: 'RUNNING', attempt: { increment: 1 }, error: Prisma.DbNull, completedAt: null } }));
    const workflow = await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowExecution.findUniqueOrThrow({ where: { id: workflowId } }));
    const step = existing ?? await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowStepExecution.create({ data: { workflowExecutionId: workflowId, organizationId: workflow.organizationId, stepKey, status: 'RUNNING', input: input as any } }));
    const advanced = await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowExecution.updateMany({ where: { id: workflowId, organizationId: lease.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { currentStep: stepKey } }));
    if (advanced.count !== 1) throw new ConflictException('Workflow lease lost before step');
    try {
      await this.leases.assertActive(lease);
      const output = await run();
      await this.leases.assertActive(lease);
      await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowStepExecution.update({ where: { id: step.id }, data: { status: 'COMPLETED', output: output as any, completedAt: new Date() } }));
      return output;
    } catch (error) {
      await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowStepExecution.update({ where: { id: step.id }, data: { status: 'FAILED', error: { message: error instanceof Error ? error.message : 'Unknown error' } as any, completedAt: new Date() } }));
      throw error;
    }
  }

  private async finish(workflowId: string, lease: WorkflowLease, step: string, output: unknown): Promise<WorkflowResult> {
    await this.leases.assertActive(lease);
    const changed = await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowExecution.updateMany({ where: { id: workflowId, organizationId: lease.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { status: 'COMPLETED', currentStep: step, output: output as any, completedAt: new Date(), version: { increment: 1 } } }));
    if (changed.count !== 1) throw new ConflictException('Workflow lease lost before completion');
    const workflow = await withMarketingTenant(this.db,lease.organizationId,tx=>tx.workflowExecution.findUniqueOrThrow({ where: { id: workflowId } }));
    return { workflowExecutionId: workflow.id, status: workflow.status, currentStep: workflow.currentStep, correlationId: workflow.correlationId, output };
  }
}