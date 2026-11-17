import {evaluateRisk,type RiskLevel} from '@medsol/policy';
export interface AgentContext{executionId:string;organizationId:string;correlationId:string;causationId?:string;input:unknown;capabilities:readonly string[]}
export interface AgentDecision{agentId:string;action:string;riskLevel:RiskLevel;rationale:string;approvalRequired:boolean;payload:unknown}
export interface Agent{readonly id:string;readonly version:number;decide(context:AgentContext):Promise<AgentDecision>}
export interface ModelGateway{complete(input:unknown):Promise<unknown>}
export class AgentRegistry{private readonly agents=new Map<string,Agent>();register(agent:Agent){if(this.agents.has(agent.id))throw new Error(`Agent already registered: ${agent.id}`);this.agents.set(agent.id,agent);return agent}get(id:string){const a=this.agents.get(id);if(!a)throw new Error(`Agent not registered: ${id}`);return a}list(){return [...this.agents.values()]}}
export class AgentRuntime{constructor(private readonly registry:AgentRegistry){}
async execute(agentId:string,context:AgentContext){const agent=this.registry.get(agentId);const d=await agent.decide(context);const p=evaluateRisk({capability:d.action,grantedCapabilities:context.capabilities,riskLevel:d.riskLevel});if(!p.allowed)return{...d,approvalRequired:true,executionAllowed:false,rationale:`${d.rationale}; policy: ${p.reason}`};return{...d,approvalRequired:p.approvalRequired,executionAllowed:true,rationale:`${d.rationale}; policy: ${p.reason}`}}
}