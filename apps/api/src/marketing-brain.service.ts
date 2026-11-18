import { Injectable, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getBrainPlan, validateBrainPlan, validateBrainCommand, nextAgentCapability, type BrainCommand } from '@medsol/agent-runtime';
import { AgentService } from './agent.service.js';

export type BrainExecutionResult = {
  correlationId:string; organizationId:string; status:'REVIEW_REQUIRED';
  executions:{stage:string;agentId:string;executionId:string;action:string;approvalRequired:boolean;executionAllowed:boolean}[];
  controls:{humanApprovalRequired:true;externalPublishingEnabled:false;scientificEvidenceVerified:false};
};
@Injectable()
export class MarketingBrainService {
 constructor(private readonly agents:AgentService){}
 plan(){const plan=getBrainPlan();validateBrainPlan(plan);return plan;}
 async assess(raw:unknown):Promise<BrainExecutionResult>{
  const command:BrainCommand=validateBrainCommand(raw);
  const plan=this.plan();
  const executions:BrainExecutionResult['executions']=[];
  let causationId:string|undefined;
  for(const stage of plan.stages){
   for(const agentId of stage.agents){
    const capability=nextAgentCapability(agentId);
    const result=await this.agents.execute(agentId,{
      organizationId:command.organizationId,correlationId:command.correlationId,
      ...(causationId?{causationId}:{}),
      input:{...command,upstreamExecutionId:causationId??null},
      capabilities:[capability]
    });
    if(!result.decision.executionAllowed)throw new ForbiddenException('Brain agent capability denied');
    executions.push({stage:stage.stage,agentId,executionId:result.executionId,action:result.decision.action,
      approvalRequired:result.decision.approvalRequired,executionAllowed:result.decision.executionAllowed});
    causationId=result.executionId;
   }
  }
  // Assessment creates only audited agent decisions, never campaigns, content, CRM records or external effects.
  // Human release requires separate authoritative approval workflow and verified scientific evidence.
  return {correlationId:command.correlationId,organizationId:command.organizationId,status:'REVIEW_REQUIRED',
    executions,controls:{humanApprovalRequired:true,externalPublishingEnabled:false,scientificEvidenceVerified:false}};
 }
}
