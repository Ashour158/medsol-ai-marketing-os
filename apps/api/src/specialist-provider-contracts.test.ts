import {describe,it,expect,vi} from 'vitest';
import {GovernedModelService} from './governed-model.service.js';
import type {ModelBudgetService} from './model-budget.service.js';
import {rehearsalInput,rehearsalScope,rehearsalDigest} from './offline-specialist-rehearsal.js';
const digest='sha256:'+'a'.repeat(64);
const request={organizationId:'tenant-fixture',correlationId:'fixture-specialist',agentId:'MKT-SCI-001',decisionDigest:digest};
describe('specialist provider contracts',()=>{
 it('executes four bounded synthetic routes with no budget mutation or external calls',async()=>{
  vi.stubEnv('MARKETING_AI_REASONING_ENABLED','false');vi.stubEnv('MARKETING_MODEL_PROVIDER','disabled');
  const reserve=vi.fn(),settle=vi.fn();
  try{
   const model=new GovernedModelService({reserve,settle} as unknown as ModelBudgetService);
   const result=await model.rehearseSpecialistContracts(request);
   expect(result).toMatchObject({decisionDigest:digest,providerRequestsMade:0,realModelInvocations:0,actualCostMicros:0,modelQualityEvaluated:false,externalEffectsAuthorized:false});
   expect(result.results.map(x=>[x.providerKey,x.model,x.passed])).toEqual([['OPENAI','synthetic:openai',true],['ANTHROPIC','synthetic:anthropic',true],['GEMINI','synthetic:gemini',true],['LOCAL','synthetic:local',true]]);
   expect(reserve).not.toHaveBeenCalled();expect(settle).not.toHaveBeenCalled();
   await expect(model.rehearseSpecialistContracts({...request,agentId:'MKT-SPECIALIST-unknown'})).rejects.toThrow();
   vi.stubEnv('MARKETING_AI_REASONING_ENABLED','true');
   await expect(model.rehearseSpecialistContracts(request)).rejects.toThrow('Offline specialist');
  }finally{vi.unstubAllEnvs();}
 });
 it('pins opt-in mode and denies arbitrary simulation modes',()=>{
  const raw={agentId:'MKT-SPECIALIST-fixture',requestKey:'fixture-contracts-001',objective:'Review synthetic scientific evidence',market:'Fixture',fixtureOnly:true,brainMode:'SPECIALIST_DECISION_V1'};
  const template={registrationId:'specialist-registration',registrationDigest:digest,templateId:'MKT-SCI-001',templateVersion:1,templateDigest:digest,templateInstalled:false,capability:'CHECK_EVIDENCE',maxInputBytes:65536};
  const expiry='2026-12-01T00:00:00.000Z';
  const legacy=rehearsalScope('tenant-fixture','operator',rehearsalInput(raw),template,expiry);
  const scoped=rehearsalScope('tenant-fixture','operator',rehearsalInput({...raw,simulationMode:'PROVIDER_CONTRACT_V1'}),template,expiry);
  expect(rehearsalDigest(scoped)).not.toBe(rehearsalDigest(legacy));
  expect(()=>rehearsalInput({...raw,simulationMode:'LIVE'})).toThrow();
  expect(()=>rehearsalInput({...raw,simulationMode:'PROVIDER_CONTRACT_V1',brainMode:'MISSION_PLAN_V1'})).toThrow();
 });
});
