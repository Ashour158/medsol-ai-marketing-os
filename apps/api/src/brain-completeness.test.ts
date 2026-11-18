import { describe, expect, it, vi } from 'vitest';
import { AGENT_ROSTER, MarketingDomainAgent, engineDecision, evaluateSkillCases } from '@medsol/agent-runtime';
import { BrainRunLedgerService } from './brain-run-ledger.service.js';
import { permissionForMarketingRoute } from './marketing-permissions.js';
describe('agent engine completeness and evaluation',()=>{
 it('all 13 agents expose all manifest capabilities with external actions fail-closed',async()=>{
  for(const manifest of AGENT_ROSTER){
   const agent=new MarketingDomainAgent(manifest);
   for(const capability of manifest.capabilities){
    const decision=await agent.decide({executionId:'e',organizationId:'tenant',correlationId:'c',input:{requestedOutcome:'Awareness'},capabilities:[capability]});
    expect(decision.action).toBe(capability);
    expect((decision.payload as any).controls.externalEffectPermitted).toBe(false);
   }
  }
 });
 it('evaluation does not authorize self-promotion even with 100% pass rate',()=>{
  const result=evaluateSkillCases([{id:'one',agentId:'MKT-SCI-001',skillKey:'CHECK_EVIDENCE',input:{},expectedState:'INSUFFICIENT_EVIDENCE',requiresApproval:true}],
    (id,capability,input)=>{
      const manifest=AGENT_ROSTER.find(m=>m.id===id)!;
      const d=engineDecision(manifest,{executionId:'e',organizationId:'t',correlationId:'c',input,capabilities:[capability]});
      return{state:(d.payload as any).state,approvalRequired:d.approvalRequired};
    });
  expect(result.passRate).toBe(1);
  expect(result.eligibleForPromotion).toBe(false);
 });
});
describe('durable brain run authority',()=>{
 it('creates 13 ordered steps and deduplicates by tenant command key',async()=>{
  const db:any={brainRun:{
   findUnique:vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({id:'existing',organizationId:'tenant'}),
   create:vi.fn().mockImplementation(async ({data}:any)=>data)
  }};
  const ledger=new BrainRunLedgerService(db);
  const command={organizationId:'tenant',correlationId:'corr',requestedOutcome:'Launch'};
  const created=await ledger.create('tenant',command,'command-123');
  expect((created.steps as any).create).toHaveLength(13);
  expect((created.steps as any).create.map((x:any)=>x.ordinal)).toEqual(Array.from({length:13},(_,i)=>i));
  await expect(ledger.create('tenant',command,'command-123')).resolves.toMatchObject({id:'existing'});
  expect(db.brainRun.create).toHaveBeenCalledTimes(1);
 });
 it('rejects cross-tenant access and restricts run routes',async()=>{
  const db:any={brainRun:{findFirst:vi.fn().mockResolvedValue(null)}};
  const ledger=new BrainRunLedgerService(db);
  await expect(ledger.get('other','run')).rejects.toThrow('not found');
  expect(db.brainRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'run',organizationId:'other'}}));
  expect(permissionForMarketingRoute('GET','/marketing/brain/runs/run')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('POST','/marketing/brain/runs')).toBe('EXECUTE_WORKFLOW');
 });
});
