import { AGENT_NERVOUS_SYSTEM, AGENT_ROSTER, type AgentManifest } from '@medsol/agent-runtime';
export type BrainStage = 'STRATEGY'|'PLANNING'|'PRODUCTION'|'GOVERNANCE'|'MEASUREMENT';
export type BrainPlan = { version: 1; stages: { stage: BrainStage; agents: string[] }[]; handoffs: Record<string,string[]>; controls: { noExternalWrites: true; humanApprovalBeforePublishing: true; scientificEvidenceRequired: true; consentRequiredForCRM: true } };
const STAGES: {stage:BrainStage;agents:string[]}[] = [
 {stage:'STRATEGY',agents:['MKT-CMO-001','MKT-STR-001']},
 {stage:'PLANNING',agents:['MKT-OPS-001','MKT-PM-001','MKT-GROWTH-001','MKT-EVENT-001']},
 {stage:'PRODUCTION',agents:['MKT-CONT-001','MKT-CREATIVE-001','MKT-SOC-001','MKT-CRM-001']},
 {stage:'GOVERNANCE',agents:['MKT-SCI-001','MKT-BRAND-001']},
 {stage:'MEASUREMENT',agents:['MKT-ANA-001']}
];
const manifestById = new Map(AGENT_ROSTER.map(m => [m.id,m]));
export function getBrainPlan(): BrainPlan {
 return {version:1,stages:STAGES.map(s=>({...s,agents:[...s.agents]})),handoffs:Object.fromEntries(Object.entries(AGENT_NERVOUS_SYSTEM).map(([k,v])=>[k,[...v]])),controls:{noExternalWrites:true,humanApprovalBeforePublishing:true,scientificEvidenceRequired:true,consentRequiredForCRM:true}};
}
export function validateBrainPlan(plan:BrainPlan): void {
 const seen=new Set<string>();
 for(const stage of plan.stages)for(const id of stage.agents){
   if(!manifestById.has(id)||seen.has(id))throw new Error('Invalid or duplicate brain agent '+id);
   seen.add(id);
 }
 if(seen.size!==AGENT_ROSTER.length)throw new Error('Brain plan omits registered agents');
 for(const [from,targets] of Object.entries(plan.handoffs)){
   if(!seen.has(from)||targets.some(to=>!seen.has(to)))throw new Error('Handoff references unknown agent');
 }
 if(!plan.controls.noExternalWrites||!plan.controls.humanApprovalBeforePublishing||!plan.controls.scientificEvidenceRequired||!plan.controls.consentRequiredForCRM)throw new Error('Brain safety gates cannot be disabled');
}
export type BrainCommand={organizationId:string;correlationId:string;requestedOutcome:string;targetAudience?:string;productId?:string;market?:string;objectiveId?:string;campaignId?:string; evidenceReferences?:string[];brandMasterVersion?:string;consentReference?:string};
export function validateBrainCommand(raw:unknown):BrainCommand{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid brain command');
 const r=raw as Record<string,unknown>;
 if(typeof r.organizationId!=='string'||!r.organizationId.trim()||typeof r.correlationId!=='string'||!r.correlationId.trim()||typeof r.requestedOutcome!=='string'||!r.requestedOutcome.trim())throw new Error('Missing brain authority context');
 if(JSON.stringify(raw).length>32000)throw new Error('Brain command too large');
 return raw as BrainCommand;
}
export function nextAgentCapability(id:string):string {
 const manifest:AgentManifest|undefined=manifestById.get(id);
 if(!manifest)throw new Error('Unknown brain agent');
 return manifest.capabilities[0]!;
}
