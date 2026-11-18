import { ConflictException, Injectable, Optional } from '@nestjs/common';
import { MarketingLearningService } from './marketing-learning.service.js';
import { MarketingReadService } from './marketing-read.service.js';
import { BrandMasterService } from './brand-master.service.js';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import { PrismaService } from './prisma.service.js';
import { AgentService } from './agent.service.js';
import { BrainRunLedgerService } from './brain-run-ledger.service.js';
import { nextAgentCapability } from '@medsol/agent-runtime';

/** Operator-triggered, single-claim brain execution. No automatic takeover of ambiguous effects. */
@Injectable()
export class BrainRunExecutorService {
 constructor(private readonly db:PrismaService,private readonly agents:AgentService,private readonly ledger:BrainRunLedgerService,@Optional() private readonly learning?:MarketingLearningService,@Optional() private readonly reads?:MarketingReadService,@Optional() private readonly brand?:BrandMasterService,@Optional() private readonly performance?:MarketingPerformanceService){}
 async execute(organizationId:string,runId:string){
  const run=await this.ledger.get(organizationId,runId);
  if(run.status==='REVIEW_REQUIRED')return run;
  if(run.status!=='PENDING')throw new ConflictException('Brain run already claimed or requires operator intervention');
  const claimed=await this.db.brainRun.updateMany({where:{id:runId,organizationId,status:'PENDING'},data:{status:'RUNNING'}});
  if(claimed.count!==1)throw new ConflictException('Concurrent brain run claim');
  let causationId:string|undefined;
  try{
   const trendBrief=this.learning?await this.learning.trendBrief(organizationId):null;
   const authorityContext=this.reads?await this.reads.brainAuthorityContext(organizationId,run.input as Record<string,unknown>):null;
   const brandMaster=this.brand?await this.brand.active(organizationId):null;
   const command=run.input as Record<string,unknown>;
   if(command.brandMasterVersion && brandMaster && command.brandMasterVersion!=='v'+brandMaster.version)
     throw new ConflictException('Brand Master version mismatched authoritative approved record');
   const performanceContext=this.performance&&typeof command.campaignId==='string'?
     await this.performance.summary(organizationId,command.campaignId):null;
   const trustedInput={...command,brandMasterVersion:brandMaster?'v'+brandMaster.version:undefined,
     // A free-text consent reference is NOT proof of opt-in; no active CRM consent authority is integrated.
     consentReference:undefined};
   const citedTrends=trendBrief?.topics.slice(0,5).map(x=>({topic:x.topic,sector:x.sector,status:x.status,evidence:x.evidence.slice(0,3)}))??[];
   for(const step of run.steps){
    if(step.status==='COMPLETED'){causationId=step.executionId??undefined;continue;}
    if(step.status!=='PENDING')throw new ConflictException('Unresolved brain step requires investigation');
    const capability=nextAgentCapability(step.agentId);
    const result=await this.agents.execute(step.agentId,{
     organizationId,correlationId:run.correlationId,
     ...(causationId?{causationId}:{}),
     input:{...trustedInput,upstreamExecutionId:causationId??null,brainRunId:runId,trendContext:{verified:false,source:'LEARNING_SIGNAL_REGISTRY',topics:citedTrends},authorityContext,performanceContext,brandContext:brandMaster?{version:brandMaster.version,rules:brandMaster.rules,sourceReference:brandMaster.sourceReference,status:'APPROVED'}:null},
     capabilities:[capability]
    });
    if(!result.decision.executionAllowed)throw new ConflictException('Agent decision denied');
    await this.ledger.checkpoint(organizationId,runId,step.agentId,result.executionId);
    causationId=result.executionId;
   }
   return this.ledger.get(organizationId,runId);
  }catch(error){
   // Failure is not retried automatically: a side effect or execution may have succeeded before its checkpoint.
   await this.db.brainRun.updateMany({where:{id:runId,organizationId,status:'RUNNING'},data:{status:'NEEDS_INTERVENTION',lastError:error instanceof Error?error.message.slice(0,1000):'Unknown failure'}});
   throw error;
  }
 }
}
