import {evaluateRisk,type RiskLevel} from '@medsol/policy'; import {authorizeAgentDecision,validateAgentInput,assertAgentExecutionBoundary,AgentPolicyViolation} from './agent-security.js'; import {AGENT_ROSTER,type AgentManifest} from './roster.js';
export interface AgentContext{executionId:string;organizationId:string;correlationId:string;causationId?:string;input:unknown;capabilities:readonly string[]}
export interface AgentDecision{agentId:string;action:string;riskLevel:RiskLevel;rationale:string;approvalRequired:boolean;payload:unknown}
export interface Agent{readonly id:string;readonly version:number;decide(context:AgentContext):Promise<AgentDecision>}
export interface ModelGateway{complete(input:unknown):Promise<unknown>}
export class AgentRegistry{private readonly agents=new Map<string,Agent>();register(agent:Agent){if(this.agents.has(agent.id))throw new Error(`Agent already registered: ${agent.id}`);this.agents.set(agent.id,agent);return agent}get(id:string){const a=this.agents.get(id);if(!a)throw new Error(`Agent not registered: ${id}`);return a}list(){return [...this.agents.values()]}}
export function getAgentManifest(id:string):AgentManifest{const m=AGENT_ROSTER.find(x=>x.id===id);if(!m)throw new Error(`Unknown agent manifest: ${id}`);return m}
export class AgentRuntime{constructor(private readonly registry:AgentRegistry){}
async execute(agentId:string,context:AgentContext){assertAgentExecutionBoundary(context.organizationId,context.correlationId,context.capabilities);validateAgentInput(context.input);const agent=this.registry.get(agentId);const d=await agent.decide(context);if(d.agentId!==agentId)throw new AgentPolicyViolation('Agent decision identity mismatch');authorizeAgentDecision(agentId,d.action,context.capabilities);validateAgentInput(d.payload);const p=evaluateRisk({capability:d.action,grantedCapabilities:context.capabilities,riskLevel:d.riskLevel});if(!p.allowed)return{...d,approvalRequired:true,executionAllowed:false,rationale:`${d.rationale}; policy: ${p.reason}`};return{...d,approvalRequired:d.approvalRequired||p.approvalRequired,executionAllowed:true,rationale:`${d.rationale}; policy: ${p.reason}`}}
}
export * from './roster.js';
export * from './agent-security.js';

export * from './model-gateway.js';

export * from './domain-engines.js';

export * from './marketing-brain.js';

export * from './skill-evaluation.js';

export * from './domain-intelligence.js';

export * from './domain-work-packages.js';

export * from './openai-responses-adapter.js';
export * from './social-discussion.js';
export * from './marketing-expansion.js';
export * from './provider-neutral-model-router.js';
