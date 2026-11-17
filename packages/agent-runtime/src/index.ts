import {evaluateRisk,type RiskLevel} from "@medsol/policy";
export interface AgentContext{executionId:string;organizationId:string;correlationId:string;input:unknown;capabilities:readonly string[]}
export interface AgentDecision{agentId:string;action:string;riskLevel:RiskLevel;rationale:string;approvalRequired:boolean;payload:unknown}
export interface Agent{readonly id:string;decide(context:AgentContext):Promise<AgentDecision>}
export interface ModelGateway{complete(input:unknown):Promise<unknown>}
export class AgentRuntime{constructor(private readonly model:ModelGateway){} async execute(agent:Agent,context:AgentContext){const d=await agent.decide(context);const p=evaluateRisk({capability:d.action,grantedCapabilities:context.capabilities,riskLevel:d.riskLevel});return p.allowed?{...d,approvalRequired:p.approvalRequired,rationale:`${d.rationale}; policy: ${p.reason}`}:{...d,approvalRequired:true,rationale:`${d.rationale}; policy: ${p.reason}`}}}