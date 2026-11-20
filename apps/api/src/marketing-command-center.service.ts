import {BadRequestException,Injectable,Optional} from '@nestjs/common';
import {MarketingWorkerHealthService} from './marketing-worker-health.service.js';
import {MarketingIncidentResponseService,type IncidentKind} from './marketing-incident-response.service.js';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {MarketingReadService} from './marketing-read.service.js';
import {DeliveryOperationsService} from './delivery-operations.service.js';
import {ModelBudgetService} from './model-budget.service.js';
import {MarketingLearningService} from './marketing-learning.service.js';
import {BrandMasterService} from './brand-master.service.js';

/** Read-only control plane: compose existing authoritative owners, never mutate business state. */
@Injectable()
export class MarketingCommandCenterService {
 constructor(
  private readonly db:PrismaService,
  private readonly reads:MarketingReadService,
  private readonly delivery:DeliveryOperationsService,
  private readonly budgets:ModelBudgetService,
  private readonly learning:MarketingLearningService,
  private readonly brand:BrandMasterService,
  @Optional() private readonly workerHealth?:MarketingWorkerHealthService,
  @Optional() private readonly responses?:MarketingIncidentResponseService
 ){}

 /**
  * R3-J non-certifying release evidence. Observes the same authoritative
  * stores as the Command Center; no shadow readiness table, no fake proof of
  * external provider eligibility, restore drills or independent penetration
  * testing. A clean tenant is NOT an accepted production deployment.
  */
 async r3ReleaseReadiness(organizationId:string){
  if(!/^[A-Za-z0-9_-]{3,160}$/.test(organizationId))
   throw new BadRequestException('Stable tenant identifier required');
  const now=new Date(),staleBefore=new Date(now.getTime()-15*60_000);
  const counts=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   const [dagActive,dagApproved,dagBlocked,dagWaiting,
    dagExpiredLease,brainPending,brainStale,brainIntervention,
    deadLetters,knowledgeReviewed,knowledgeQuarantined,
    memoryApproved,memoryExpired,graphReviewed,skillsWaiting,
    signedAgents,toolsRegistered]=await Promise.all([
    tx.blueprintDeployment.count({where:{organizationId,status:'ACTIVE'}}),
    tx.blueprintDeployment.count({where:{organizationId,status:'APPROVED'}}),
    tx.workflowExecution.count({where:{organizationId,
     workflowType:'BLUEPRINT_OFFLINE_DAG',status:'BLOCKED'}}),
    tx.workflowExecution.count({where:{organizationId,
     workflowType:'BLUEPRINT_OFFLINE_DAG',status:'WAITING_APPROVAL'}}),
    tx.workflowExecution.count({where:{organizationId,
     workflowType:'BLUEPRINT_OFFLINE_DAG',status:'RUNNING',
     leaseOwner:{not:null},leaseExpiresAt:{lte:now}}}),
    tx.brainRun.count({where:{organizationId,status:'PENDING'}}),
    tx.brainRun.count({where:{organizationId,status:'RUNNING',
     updatedAt:{lte:staleBefore}}}),
    tx.brainRun.count({where:{organizationId,status:'NEEDS_INTERVENTION'}}),
    tx.outboxEvent.count({where:{organizationId,
     deadLetteredAt:{not:null}}}),
    tx.knowledgeDocument.count({where:{organizationId,status:'REVIEWED',
     OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}),
    tx.knowledgeDocument.count({where:{organizationId,status:'QUARANTINED'}}),
    tx.agentKnowledgeMemory.count({where:{organizationId,status:'APPROVED',
     expiresAt:{gt:now}}}),
    tx.agentKnowledgeMemory.count({where:{organizationId,status:'APPROVED',
     expiresAt:{lte:now}}}),
    tx.knowledgeRelation.count({where:{organizationId,status:'REVIEWED'}}),
    tx.agentSkillProposal.count({where:{organizationId,status:{
     in:['PROPOSED','EVALUATED']}}}),
    tx.agentManifestRevision.count({where:{organizationId,status:'APPROVED'}}),
    tx.governedToolRegistration.count({where:{organizationId,status:'APPROVED'}})
   ]);
   return{dagActive,dagApproved,dagBlocked,dagWaiting,dagExpiredLease,
    brainPending,brainStale,brainIntervention,deadLetters,
    knowledgeReviewed,knowledgeQuarantined,memoryApproved,memoryExpired,
    graphReviewed,skillsWaiting,signedAgents,toolsRegistered};
  });
  const incidentCount=counts.dagBlocked+counts.dagExpiredLease+
   counts.brainStale+counts.brainIntervention+counts.deadLetters;
  const gates=[
   {id:'R3_RUNTIME',owner:'MarketingWorkflowService',
    status:counts.dagActive>0&&incidentCount===0&&
     process.env.MARKETING_DAG_OFFLINE_EXECUTION_ENABLED==='true'&&
     process.env.MARKETING_AI_REASONING_ENABLED!=='true'?
     'OFFLINE_CONFIGURED_NOT_CERTIFIED':'NEEDS_OPERATOR_REVIEW',
    evidence:'Canonical signed deployment and workflow counts; not external execution proof'},
   {id:'R3_AGENT_TRUST',owner:'AgentService',
    status:counts.signedAgents>0?'PARTIAL_SIGNED_RELEASES':'NO_SIGNED_RELEASE_EVIDENCE',
    evidence:'Approved agent manifest rows; no enterprise agent skill-quality acceptance'},
   {id:'R3_KNOWLEDGE',owner:'MarketingLearningService',
    status:counts.knowledgeReviewed>0?'OFFLINE_REVIEWED_EVIDENCE':'NO_REVIEWED_EVIDENCE',
    evidence:'Tenant-scoped reviewed source/memory/graph counts; no verified scientific truth or neural retrieval'},
   {id:'R3_TOOL_GATEWAY',owner:'GovernedToolRegistryService',
    status:'BLOCKED_NO_REMOTE_GATEWAY',
    evidence:'Registry metadata never constitutes approved remote MCP/A2A invocation'},
   {id:'R3_MODEL_PROVIDERS',owner:'GovernedModelService',
    status:'BLOCKED_NO_PROVIDER_ACCEPTANCE',
    evidence:'Adapter simulations and budgets do not prove approved tenant BYOK/privacy/billing'},
   {id:'R3_EXTERNAL_CAMPAIGN',owner:'CampaignPublicationService',
    status:'BLOCKED_NO_REAL_DESTINATION',
    evidence:'No eligible verified customer social destination or completed remote receipt'},
   {id:'R3_INDEPENDENT_SECURITY',owner:'PlatformSecurity',
    status:'NOT_VERIFIED',evidence:'Independent penetration test and red-team proof not imported'},
   {id:'R3_RESTORE_AND_DR',owner:'ReliabilityOperations',
    status:'NOT_VERIFIED',evidence:'CI migration rehearsals are not a tested backup restore, failover or RTO/RPO drill'},
   {id:'R3_500_E2E',owner:'QualityEngineering',
    status:'NOT_VERIFIED',evidence:'500-case program is planned; total independently executed end-to-end proofs unavailable'}
  ] as const;
  return{organizationId,asOf:now.toISOString(),
   release:'R3',verdict:'NOT_CERTIFIED' as const,
   productionExternalEffectsAuthorized:false as const,
   certificationCanBeOverriddenByThisReport:false as const,
   noRealProviderCredentialsRequired:true as const,
   provenance:'TENANT_AUTHORITY_COUNTS_AND_FAIL_CLOSED_UNVERIFIED_GATES',
   counts,gates,
   incidentCount,
   acceptanceEvidence:{
    ciRunNotInspectedByThisAPI:true,providerAcceptanceVerified:false,
    independentSecuritySignedOff:false,backupRestoreDrillVerified:false,
    legalConsentAndDestinationVerified:false,
    independent500CaseE2eCertified:false
   },
   requiredAction:'Complete offline reliability, security, evidence and independent E2E gates before any external provider activation'};
 }
 async snapshot(organizationId:string){
  const staleBefore=new Date(Date.now()-15*60_000);
  const [overview,agentOperations,delivery,budget,trends,brand,
    runningStale,intervention,staleCount,interventionCount,approvals,skills,brainRuns,brainRunCount] = await Promise.all([
    this.reads.overview(organizationId),this.reads.agentOperations(organizationId),
    this.delivery.summary(organizationId),this.budgets.summary(organizationId),
    this.learning.trendBrief(organizationId),this.brand.active(organizationId),
    withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findMany({where:{organizationId,status:'RUNNING',updatedAt:{lte:staleBefore}},
      take:20,orderBy:{updatedAt:'asc'},select:{id:true,status:true,updatedAt:true,currentAgentId:true}})),
    withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findMany({where:{organizationId,status:'NEEDS_INTERVENTION'},
      take:30,orderBy:{updatedAt:'asc'},select:{id:true,status:true,updatedAt:true,currentAgentId:true,lastError:true}})),
    withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.count({where:{organizationId,status:'RUNNING',updatedAt:{lte:staleBefore}}})),
    withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.count({where:{organizationId,status:'NEEDS_INTERVENTION'}})),
    withMarketingTenant(this.db,organizationId,tx=>tx.approval.count({where:{organizationId,decision:'PENDING'}})),
    withMarketingTenant(this.db,organizationId,tx=>tx.agentSkillProposal.count({where:{organizationId,status:{in:['PROPOSED','EVALUATED']}}})),
    withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findMany({where:{organizationId},take:20,orderBy:{createdAt:'desc'},
      select:{id:true,status:true,currentAgentId:true,updatedAt:true,createdAt:true,commandKey:true}})),
    withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.count({where:{organizationId}}))
  ]);
  const incidents=[
    ...intervention.map(r=>({id:'brain-intervention:'+r.id,severity:'CRITICAL' as const,
      kind:'BRAIN_NEEDS_INTERVENTION',runId:r.id,updatedAt:r.updatedAt,
      message:r.lastError??'Execution outcome requires operator investigation'})),
    ...runningStale.map(r=>({id:'brain-stale:'+r.id,severity:'WARNING' as const,
      kind:'BRAIN_STALE',runId:r.id,updatedAt:r.updatedAt,
      message:'RUNNING for more than 15 minutes; inspect before operator quarantine'})),
    ...delivery.oldestDeadLetters.map(e=>({id:'delivery-dead:'+e.id,severity:'CRITICAL' as const,
      kind:'OUTBOX_DEAD_LETTER',runId:null,updatedAt:e.deadLetteredAt,
      message:e.lastError??'Delivery failed after bounded attempts'}))
  ].slice(0,80);
  // Never infer health or totals from a sample: the arrays above are intentionally capped.
  const critical=interventionCount>0||delivery.deadLetters>0;
  const warning=critical||staleCount>0||overview.failedAgentExecutions>0||delivery.retrying>0||
    (budget.enabled&&budget.requiresExternalBillingReconciliation===true);
  const workerFleet=this.workerHealth?await this.workerHealth.summary():null;
  const workerAttention=!!workerFleet&&(workerFleet.stale>0||
    (workerFleet.workerConfiguredHere&&workerFleet.active===0));
  return {
    workerFleet,
    asOf:new Date().toISOString(),organizationId,health:critical?'ACTION_REQUIRED':warning||workerAttention?'ATTENTION':'NO_DETECTED_INCIDENTS',
    healthIsSlaGuarantee:false,
    totals:{...overview,brainRuns:brainRunCount,pendingApprovals:approvals,pendingSkillDecisions:skills,
      staleBrainRuns:staleCount,interventionBrainRuns:interventionCount,deadLetterEvents:delivery.deadLetters},
    incidents,incidentCoverage:{shown:incidents.length,total:staleCount+interventionCount+delivery.deadLetters,
      truncated:incidents.length<staleCount+interventionCount+delivery.deadLetters},brainRuns,delivery,
    agents:{total:agentOperations.total,byStatus:agentOperations.byStatus,recent:agentOperations.recent.slice(0,12)},
    modelBudget:budget,
    learning:{topics:trends.topics.slice(0,15),reviewStatus:'HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED'},
    brand:{approved:!!brand,version:brand?.version??null,approvedAt:brand?.approvedAt??null},
    controls:{externalPublishingEnabled:false,autonomousSkillPromotionEnabled:false,
      consentProofEnforced:true,modelProviderEnabled:process.env.MARKETING_MODEL_PROVIDER==='openai'&&process.env.MARKETING_AI_REASONING_ENABLED==='true'}
  };
 }
 /**
  * Tenant-scoped, manager-only incident inventory. No new incident authority is created:
  * BrainRun and OutboxEvent retain ownership of status and recovery.
  * Cursor must resolve to an incident still visible in the same tenant and filter.
  * Concurrent state changes may invalidate cursors; clients restart the listing then.
  */
 async incidentInventory(organizationId:string,rawKind:unknown,rawCursor?:unknown,rawLimit?:unknown){
  const kinds=['BRAIN_NEEDS_INTERVENTION','BRAIN_STALE','OUTBOX_DEAD_LETTER'] as const;
  if(typeof rawKind!=='string'||!kinds.includes(rawKind as typeof kinds[number]))
   throw new BadRequestException('Supported incident kind required');
  if(rawCursor!==undefined&&(typeof rawCursor!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(rawCursor)))
   throw new BadRequestException('Invalid incident cursor');
  const cursor=rawCursor as string|undefined;
  const limit=rawLimit===undefined?25:Number(rawLimit);
  if(!Number.isInteger(limit)||limit<1||limit>100)
   throw new BadRequestException('Incident limit must be 1 to 100');
  if(rawKind==='OUTBOX_DEAD_LETTER'){
   const where={organizationId,deadLetteredAt:{not:null}};
   const [total,rows]=await withMarketingTenant(this.db,organizationId,async tx=>{
    if(cursor&&!(await tx.outboxEvent.findFirst({where:{...where,id:cursor},select:{id:true}})))
     throw new BadRequestException('Incident cursor no longer belongs to this tenant and filter');
    return Promise.all([
     tx.outboxEvent.count({where}),
     tx.outboxEvent.findMany({where,orderBy:[{deadLetteredAt:'asc'},{id:'asc'}],
      take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),
      select:{id:true,deadLetteredAt:true,lastError:true,eventType:true,attempts:true}})
    ]);
   });
   const visible=rows.slice(0,limit);
   const responses=this.responses?await this.responses.batch(organizationId,rawKind as IncidentKind,visible.map(r=>r.id)):null;
   return {kind:rawKind,total,incidents:visible.map(r=>({
    sourceId:r.id,
    response:responses?.get(r.id)?.occurrenceAt.getTime()===r.deadLetteredAt?.getTime()?
     {acknowledgedAt:responses?.get(r.id)?.acknowledgedAt??null,
      acknowledgedBy:responses?.get(r.id)?.acknowledgedBy??null,
      lastNotifiedLevel:responses?.get(r.id)?.lastNotifiedLevel??-1}:null,
    id:'delivery-dead:'+r.id,severity:'CRITICAL',kind:rawKind,runId:null,
    updatedAt:r.deadLetteredAt,message:r.lastError??'Delivery failed after bounded attempts',
    eventType:r.eventType,attempts:r.attempts
   })),nextCursor:rows.length>limit?visible[visible.length-1]?.id:null};
  }
  const staleBefore=new Date(Date.now()-15*60_000);
  const where=rawKind==='BRAIN_STALE'
   ?{organizationId,status:'RUNNING',updatedAt:{lte:staleBefore}}
   :{organizationId,status:'NEEDS_INTERVENTION'};
  if(cursor&&!(await withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findFirst({where:{...where,id:cursor},select:{id:true}}))))
   throw new BadRequestException('Incident cursor no longer belongs to this tenant and filter');
  const [total,rows]=await Promise.all([
   withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.count({where})),
   withMarketingTenant(this.db,organizationId,tx=>tx.brainRun.findMany({where,orderBy:[{updatedAt:'asc'},{id:'asc'}],
    take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),
    select:{id:true,updatedAt:true,currentAgentId:true,lastError:true}}))
  ]);
  const visible=rows.slice(0,limit);
  const responses=this.responses?await this.responses.batch(organizationId,rawKind as IncidentKind,visible.map(r=>r.id)):null;
  return {kind:rawKind,total,incidents:visible.map(r=>({
   sourceId:r.id,
   response:responses?.get(r.id)?.occurrenceAt.getTime()===r.updatedAt.getTime()?
    {acknowledgedAt:responses?.get(r.id)?.acknowledgedAt??null,
     acknowledgedBy:responses?.get(r.id)?.acknowledgedBy??null,
     lastNotifiedLevel:responses?.get(r.id)?.lastNotifiedLevel??-1}:null,
   id:(rawKind==='BRAIN_STALE'?'brain-stale:':'brain-intervention:')+r.id,
   severity:rawKind==='BRAIN_STALE'?'WARNING':'CRITICAL',kind:rawKind,runId:r.id,
   updatedAt:r.updatedAt,currentAgentId:r.currentAgentId,
   message:rawKind==='BRAIN_STALE'?'RUNNING for more than 15 minutes; inspect before operator quarantine':
    r.lastError??'Execution outcome requires operator investigation'
  })),nextCursor:rows.length>limit?visible[visible.length-1]?.id:null};
 }

}
