import { describe, expect, it, vi } from 'vitest';
import { AGENT_ROSTER, AgentRegistry, AgentRuntime, MarketingDomainAgent, getBrainPlan, validateBrainPlan, nextAgentCapability } from '@medsol/agent-runtime';
import { MarketingBrainService } from './marketing-brain.service.js';
import { permissionForMarketingRoute } from './marketing-permissions.js';

describe('marketing brain and nervous system', () => {
 it('covers all 13 unique agents with valid handoffs and immutable safety gates', () => {
  const plan=getBrainPlan();
  expect(()=>validateBrainPlan(plan)).not.toThrow();
  const agents=plan.stages.flatMap(x=>x.agents);
  expect(agents).toHaveLength(13);
  expect(new Set(agents).size).toBe(13);
  expect(plan.controls).toEqual({noExternalWrites:true,humanApprovalBeforePublishing:true,scientificEvidenceRequired:true,consentRequiredForCRM:true});
 });
 it('registers each domain engine with manifest-approved actions and tenant boundary', async () => {
  const registry=new AgentRegistry();
  for(const m of AGENT_ROSTER)registry.register(new MarketingDomainAgent(m));
  const runtime=new AgentRuntime(registry);
  for(const m of AGENT_ROSTER){
   const decision=await runtime.execute(m.id,{executionId:'ex',organizationId:'tenant',correlationId:'corr',input:{requestedOutcome:'Launch'},capabilities:[nextAgentCapability(m.id)]});
   expect(decision.agentId).toBe(m.id);
   expect(decision.executionAllowed).toBe(true);
   expect((decision.payload as any).controls.externalEffectPermitted).toBe(false);
  }
 });
 it('blocks unsupported scientific evidence and external social publishing by default', async () => {
  const registry=new AgentRegistry();
  for(const m of AGENT_ROSTER)registry.register(new MarketingDomainAgent(m));
  const runtime=new AgentRuntime(registry);
  const sci=await runtime.execute('MKT-SCI-001',{executionId:'s',organizationId:'t',correlationId:'c',input:{},capabilities:['EXTRACT_CLAIM']});
  expect(sci.approvalRequired).toBe(true);
  expect((sci.payload as any).state).toBe('INSUFFICIENT_EVIDENCE');
  const social=await runtime.execute('MKT-SOC-001',{executionId:'o',organizationId:'t',correlationId:'c',input:{},capabilities:['PUBLISH_SOCIAL']});
  expect(social.approvalRequired).toBe(true);
  expect((social.payload as any).controls.externalEffectPermitted).toBe(false);
 });
 it('runs all agents with shared tenant, correlation and causal chain, returning review gate', async () => {
  const calls:any[]=[];
  const agents:any={execute:vi.fn().mockImplementation(async (id:string, input:any)=>{
    calls.push({id,input});return {executionId:'exec-'+calls.length,decision:{action:input.capabilities[0],approvalRequired:false,executionAllowed:true}};
  })};
  const brain=new MarketingBrainService(agents);
  const result=await brain.assess({organizationId:'tenant',correlationId:'corr',requestedOutcome:'Campaign'});
  expect(result.status).toBe('REVIEW_REQUIRED');
  expect(result.executions).toHaveLength(13);
  expect(calls.every(c=>c.input.organizationId==='tenant'&&c.input.correlationId==='corr')).toBe(true);
  expect(calls[1].input.causationId).toBe('exec-1');
  expect(result.controls.externalPublishingEnabled).toBe(false);
 });
 it('restricts brain routes by permission',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/brain/plan')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('POST','/marketing/brain/assess')).toBe('EXECUTE_WORKFLOW');
 });
});
