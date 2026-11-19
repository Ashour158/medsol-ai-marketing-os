import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash,randomUUID } from 'node:crypto';
import { MarketingRequest, MarketingRequestSchema,simulateBlueprintDraft,type BlueprintSimulationResult } from '@medsol/contracts';
import { PrismaService } from './prisma.service.js';
import { AgentService } from './agent.service.js';
import { CampaignService } from './campaign.service.js';
import { WorkflowLeaseService, type WorkflowLease } from './workflow-lease.service.js';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';

type WorkflowResult = { workflowExecutionId: string; status: string; currentStep: string; correlationId: string; output?: unknown };

@Injectable()
export class MarketingWorkflowService {
  constructor(private readonly db: PrismaService, private readonly agents: AgentService, private readonly campaigns: CampaignService, private readonly leases: WorkflowLeaseService) {}


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

  async start(request: MarketingRequest): Promise<WorkflowResult> {
    const correlationId = randomUUID();
    const workflow = await this.db.workflowExecution.create({ data: { organizationId: request.organizationId, workflowType: 'MARKETING_CAMPAIGN_LIFECYCLE', currentStep: 'CMO_ASSESSMENT', correlationId, input: request as any } });
    return this.runWithLease(workflow.id, request, correlationId);
  }

  async resume(id: string, organizationId: string): Promise<WorkflowResult> {
    const workflow = await this.db.workflowExecution.findFirst({ where: { id, organizationId } });
    if (!workflow) throw new NotFoundException('Workflow execution not found in tenant');
    if (['WAITING_APPROVAL', 'COMPLETED', 'BLOCKED', 'CANCELLED'].includes(workflow.status)) {
      return { workflowExecutionId: workflow.id, status: workflow.status, currentStep: workflow.currentStep, correlationId: workflow.correlationId, output: workflow.output ?? undefined };
    }
    if (workflow.status === 'RUNNING') throw new ConflictException('RUNNING recovery is disabled until all external side effects are fenced');
    const claimed = await this.db.workflowExecution.updateMany({
      where: { id, organizationId, status: 'FAILED', version: workflow.version },
      data: { status: 'RUNNING', currentStep: 'RECOVERING', completedAt: null, version: { increment: 1 } }
    });
    if (claimed.count !== 1) throw new ConflictException('Workflow recovery already claimed');
    return this.runWithLease(workflow.id, MarketingRequestSchema.parse(workflow.input), workflow.correlationId);
  }

  private async runWithLease(workflowId: string, request: MarketingRequest, correlationId: string): Promise<WorkflowResult> {
    const lease = await this.leases.claim(request.organizationId, workflowId, 300000);
    try { return await this.execute(workflowId, request, correlationId, lease); }
    finally { await this.leases.release(lease); }
  }

  private async execute(workflowId: string, request: MarketingRequest, correlationId: string, lease: WorkflowLease): Promise<WorkflowResult> {
    try {
      const cmo = await this.step(workflowId, lease, 'CMO_ASSESSMENT', request, () => this.agents.execute('MKT-CMO-001', { organizationId: request.organizationId, correlationId, input: request, capabilities: ['ASSESS_OBJECTIVE'] }));
      const strategy = await this.step(workflowId, lease, 'STRATEGY_ASSESSMENT', { request, cmo: cmo.decision.payload }, () => this.agents.execute('MKT-STR-001', { organizationId: request.organizationId, correlationId, causationId: cmo.executionId, input: { request, cmo: cmo.decision.payload }, capabilities: ['ASSESS_MARKET'] }));
      if (!request.objectiveId) return this.finish(workflowId, lease, 'OBJECTIVE_REQUIRED', { cmo: cmo.decision.payload, strategy: strategy.decision.payload, nextAction: 'Provide objectiveId before campaign creation.' });
      const code = 'MKT-' + Date.now().toString(36).toUpperCase() + '-' + randomUUID().slice(0, 6).toUpperCase();
      const campaign = await this.step(workflowId, lease, 'CAMPAIGN_CREATION', { request, strategy: strategy.decision.payload }, () => this.campaigns.create({ commandId: workflowId + ':CAMPAIGN_CREATION', correlationId, organizationId: request.organizationId, objectiveId: request.objectiveId!, productId: request.productId, brandId: request.brandId, code, name: request.requestedOutcome, riskLevel: 'R2' }));
      const transitions = [['ASSESSMENT', 'CAMPAIGN_ASSESSMENT'], ['PROPOSED', 'CAMPAIGN_PROPOSAL'], ['APPROVAL_PENDING', 'APPROVAL_GATE']] as const;
      let last = campaign;
      for (const [to, stepKey] of transitions) {
        const currentVersion = (last as { version: number }).version;
        last = await this.step(workflowId, lease, stepKey, last, () => this.campaigns.transition({ commandId: workflowId + ':' + stepKey, correlationId, organizationId: request.organizationId, campaignId: (campaign as {campaignId:string}).campaignId, to, expectedVersion: currentVersion, workflowExecutionId: workflowId }));
      }
      await this.leases.assertActive(lease);
      const waiting = await this.db.workflowExecution.updateMany({ where: { id: workflowId, organizationId: request.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { status: 'WAITING_APPROVAL', currentStep: 'APPROVAL_GATE', output: { campaign: last, workflow: 'WAITING_FOR_HUMAN_APPROVAL' } as any, version: { increment: 1 } } });
      if (waiting.count !== 1) throw new ConflictException('Workflow lease lost before approval transition');
      return { workflowExecutionId: workflowId, status: 'WAITING_APPROVAL', currentStep: 'APPROVAL_GATE', correlationId, output: { campaign: last, message: 'Campaign is waiting for human approval.' } };
    } catch (error) {
      await this.db.workflowExecution.updateMany({ where: { id: workflowId, organizationId: request.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { status: 'FAILED', currentStep: 'FAILED', error: { message: error instanceof Error ? error.message : 'Unknown error' } as any, completedAt: new Date(), version: { increment: 1 } } });
      throw error;
    }
  }

  async completeAfterApproval(workflowExecutionId: string | null, organizationId: string, approval: unknown): Promise<void> {
    if (!workflowExecutionId) return;
    const workflow = await this.db.workflowExecution.findFirst({ where: { id: workflowExecutionId, organizationId, status: 'WAITING_APPROVAL' } });
    if (!workflow) return;
    await this.completeWorkflow(workflow.id, 'APPROVAL_COMPLETED', approval, 'COMPLETED');
  }

  async blockAfterApprovalRejection(approvalId: string, organizationId: string, rationale: string): Promise<void> {
    const approval = await this.db.approval.findFirst({ where: { id: approvalId, organizationId } });
    if (!approval?.workflowExecutionId) return;
    const workflow = await this.db.workflowExecution.findFirst({ where: { id: approval.workflowExecutionId, organizationId, status: 'WAITING_APPROVAL' } });
    if (!workflow) return;
    await this.completeWorkflow(workflow.id, 'APPROVAL_REJECTED', { approvalId, rationale, blocked: true }, 'BLOCKED');
  }

  private async completeWorkflow(id: string, stepKey: string, output: unknown, status: 'COMPLETED' | 'BLOCKED'): Promise<void> {
    await this.db.$transaction(async tx => {
      const workflow = await tx.workflowExecution.findFirst({ where: { id, status: 'WAITING_APPROVAL' } });
      if (!workflow) return;
      await tx.workflowExecution.updateMany({ where: { id: workflow.id, status: 'WAITING_APPROVAL' }, data: { status, currentStep: stepKey, output: output as any, completedAt: new Date(), version: { increment: 1 } } });
      await tx.workflowStepExecution.updateMany({ where: { workflowExecutionId: workflow.id, stepKey: 'APPROVAL_GATE', status: 'RUNNING' }, data: { status: 'COMPLETED', output: output as any, completedAt: new Date() } });
    });
  }

  async get(id: string, organizationId: string): Promise<unknown> {
    const workflow = await this.db.workflowExecution.findFirst({ where: { id, organizationId }, include: { steps: { orderBy: { startedAt: 'asc' } } } });
    if (!workflow) throw new NotFoundException('Workflow execution not found in tenant');
    return workflow;
  }

  private async step<T>(workflowId: string, lease: WorkflowLease, stepKey: string, input: unknown, run: () => Promise<T>): Promise<T> {
    await this.leases.assertActive(lease);
    const existing = await this.db.workflowStepExecution.findUnique({ where: { workflowExecutionId_stepKey: { workflowExecutionId: workflowId, stepKey } } });
    if (existing?.status === 'COMPLETED') return existing.output as T;
    if (existing?.status === 'FAILED') await this.db.workflowStepExecution.update({ where: { id: existing.id }, data: { status: 'RUNNING', attempt: { increment: 1 }, error: Prisma.DbNull, completedAt: null } });
    const workflow = await this.db.workflowExecution.findUniqueOrThrow({ where: { id: workflowId } });
    const step = existing ?? await this.db.workflowStepExecution.create({ data: { workflowExecutionId: workflowId, organizationId: workflow.organizationId, stepKey, status: 'RUNNING', input: input as any } });
    const advanced = await this.db.workflowExecution.updateMany({ where: { id: workflowId, organizationId: lease.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { currentStep: stepKey } });
    if (advanced.count !== 1) throw new ConflictException('Workflow lease lost before step');
    try {
      await this.leases.assertActive(lease);
      const output = await run();
      await this.leases.assertActive(lease);
      await this.db.workflowStepExecution.update({ where: { id: step.id }, data: { status: 'COMPLETED', output: output as any, completedAt: new Date() } });
      return output;
    } catch (error) {
      await this.db.workflowStepExecution.update({ where: { id: step.id }, data: { status: 'FAILED', error: { message: error instanceof Error ? error.message : 'Unknown error' } as any, completedAt: new Date() } });
      throw error;
    }
  }

  private async finish(workflowId: string, lease: WorkflowLease, step: string, output: unknown): Promise<WorkflowResult> {
    await this.leases.assertActive(lease);
    const changed = await this.db.workflowExecution.updateMany({ where: { id: workflowId, organizationId: lease.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() }, status: 'RUNNING' }, data: { status: 'COMPLETED', currentStep: step, output: output as any, completedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Workflow lease lost before completion');
    const workflow = await this.db.workflowExecution.findUniqueOrThrow({ where: { id: workflowId } });
    return { workflowExecutionId: workflow.id, status: workflow.status, currentStep: workflow.currentStep, correlationId: workflow.correlationId, output };
  }
}