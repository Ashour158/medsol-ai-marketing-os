import {Injectable} from '@nestjs/common';
import {PrismaService} from './prisma.service.js';
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
  private readonly brand:BrandMasterService
 ){}
 async snapshot(organizationId:string){
  const staleBefore=new Date(Date.now()-15*60_000);
  const [overview,agentOperations,delivery,budget,trends,brand,
    runningStale,intervention,approvals,skills,brainRuns] = await Promise.all([
    this.reads.overview(organizationId),this.reads.agentOperations(organizationId),
    this.delivery.summary(organizationId),this.budgets.summary(organizationId),
    this.learning.trendBrief(organizationId),this.brand.active(organizationId),
    this.db.brainRun.findMany({where:{organizationId,status:'RUNNING',updatedAt:{lte:staleBefore}},
      take:20,orderBy:{updatedAt:'asc'},select:{id:true,status:true,updatedAt:true,currentAgentId:true}}),
    this.db.brainRun.findMany({where:{organizationId,status:'NEEDS_INTERVENTION'},
      take:30,orderBy:{updatedAt:'desc'},select:{id:true,status:true,updatedAt:true,currentAgentId:true,lastError:true}}),
    this.db.approval.count({where:{organizationId,decision:'PENDING'}}),
    this.db.agentSkillProposal.count({where:{organizationId,status:{in:['PROPOSED','EVALUATED']}}}),
    this.db.brainRun.findMany({where:{organizationId},take:20,orderBy:{createdAt:'desc'},
      select:{id:true,status:true,currentAgentId:true,updatedAt:true,createdAt:true,commandKey:true}})
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
  const critical=incidents.some(i=>i.severity==='CRITICAL');
  const warning=critical||incidents.length>0||overview.failedAgentExecutions>0||delivery.retrying>0||
    (budget.enabled&&budget.requiresExternalBillingReconciliation===true);
  return {
    asOf:new Date().toISOString(),organizationId,health:critical?'ACTION_REQUIRED':warning?'ATTENTION':'NO_DETECTED_INCIDENTS',
    healthIsSlaGuarantee:false,
    totals:{...overview,brainRuns:brainRuns.length,pendingApprovals:approvals,pendingSkillDecisions:skills,
      staleBrainRuns:runningStale.length,interventionBrainRuns:intervention.length},
    incidents,brainRuns,delivery,
    agents:{total:agentOperations.total,byStatus:agentOperations.byStatus,recent:agentOperations.recent.slice(0,12)},
    modelBudget:budget,
    learning:{topics:trends.topics.slice(0,15),reviewStatus:'HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED'},
    brand:{approved:!!brand,version:brand?.version??null,approvedAt:brand?.approvedAt??null},
    controls:{externalPublishingEnabled:false,autonomousSkillPromotionEnabled:false,
      consentProofEnforced:true,modelProviderEnabled:process.env.MARKETING_MODEL_PROVIDER==='openai'&&process.env.MARKETING_AI_REASONING_ENABLED==='true'}
  };
 }
}
