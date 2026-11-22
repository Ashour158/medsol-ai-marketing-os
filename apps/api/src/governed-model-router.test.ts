import {describe,expect,it,vi,afterEach} from 'vitest';
import {BoundedModelGateway,GovernedModelRouter,SimulatedModelAdapter,
 MODEL_PROVIDER_KEYS,MODEL_SIMULATION_SCENARIOS,ModelGatewayError,
 type ModelAdapter,type ModelRequest} from '@medsol/agent-runtime';
import {GovernedModelService,parseSimulatedTenantRoutes} from './governed-model.service.js';
afterEach(()=>vi.unstubAllEnvs());
const request:ModelRequest={organizationId:'tenant-a',correlationId:'corr-a',
 agentId:'MKT-CMO-001',purpose:'INTERNAL_MARKETING_DRAFT',
 input:'Internal safe synthetic prompt',maxOutputTokens:200,
 timeoutMs:1000,estimatedCostMicros:100};
describe('R3-C governed offline model provider routing',()=>{
 it('exercises four provider protocols with zero actual model inference or cost',async()=>{
  for(const providerKey of MODEL_PROVIDER_KEYS){
   const adapter=new SimulatedModelAdapter({providerKey,scenario:'SUCCESS'});
   const router=new GovernedModelRouter({
    routes:[{agentId:request.agentId,purpose:request.purpose,providerKey}],
    adapters:{[providerKey]:adapter}
   });
   const result=await new BoundedModelGateway(router).complete(request);
   expect(result.model).toBe('synthetic:'+providerKey.toLowerCase());
   expect(result.text).toContain('NO AI INFERENCE');
   expect(result.actualCostMicros).toBe(0);
   expect(result.outputTokens).toBeLessThanOrEqual(request.maxOutputTokens);
  }
 });
 it('denies unregistered agents, purposes, duplicate and unconfigured routes',async()=>{
  const adapter=new SimulatedModelAdapter({providerKey:'LOCAL',scenario:'SUCCESS'});
  const route={agentId:request.agentId,purpose:request.purpose,
   providerKey:'LOCAL' as const};
  const router=new GovernedModelRouter({routes:[route],adapters:{LOCAL:adapter}});
  await expect(new BoundedModelGateway(router).complete({
   ...request,purpose:'EXTERNAL_SEND'
  })).rejects.toThrow('No authorized provider route');
  expect(()=>new GovernedModelRouter({routes:[route,route],adapters:{LOCAL:adapter}}))
   .toThrow('Duplicate governed model route');
  expect(()=>new GovernedModelRouter({routes:[{...route,agentId:'AG-PRICE'}],
   adapters:{LOCAL:adapter}})).toThrow('canonical agent');
  expect(()=>new GovernedModelRouter({routes:[{...route,providerKey:'GEMINI'}],
   adapters:{LOCAL:adapter}})).toThrow('no configured adapter');
  expect(()=>new SimulatedModelAdapter({
   providerKey:'UNREVIEWED' as any,scenario:'SUCCESS'
  })).toThrow('Unknown model provider');
 });
 it('never retries or falls back after ambiguous provider outcomes',async()=>{
  const bad:ModelAdapter={complete:vi.fn().mockRejectedValue(
   new ModelGatewayError('TIMEOUT_AFTER_ACCEPT'))};
  const fallback:ModelAdapter={complete:vi.fn().mockResolvedValue({
   text:'forbidden',inputTokens:1,outputTokens:1,actualCostMicros:0,model:'local'
  })};
  const router=new GovernedModelRouter({routes:[{
   agentId:request.agentId,purpose:request.purpose,providerKey:'OPENAI'
  }],adapters:{OPENAI:bad,LOCAL:fallback}});
  await expect(new BoundedModelGateway(router).complete(request))
   .rejects.toThrow('TIMEOUT_AFTER_ACCEPT');
  expect(bad.complete).toHaveBeenCalledTimes(1);
  expect(fallback.complete).not.toHaveBeenCalled();
 });
 it('rejects all simulated failure modes, without provider egress',async()=>{
  expect(MODEL_SIMULATION_SCENARIOS).toHaveLength(7);
  for(const scenario of MODEL_SIMULATION_SCENARIOS.filter(x=>x!=='SUCCESS')){
   const adapter=new SimulatedModelAdapter({providerKey:'GEMINI',scenario});
   await expect(new BoundedModelGateway(adapter).complete(request))
    .rejects.toThrow('SIMULATED_'+scenario);
  }
 });
 it('integrates with existing model budget reserve and settle, no API keys',async()=>{
  vi.stubEnv('MARKETING_MODEL_PROVIDER','simulation');
  vi.stubEnv('MARKETING_SIMULATED_MODEL_PROVIDER','ANTHROPIC');
  vi.stubEnv('MARKETING_SIMULATED_MODEL_SCENARIO','SUCCESS');
  const budgets={reserve:vi.fn().mockResolvedValue({id:'reserve-a',replay:false}),
   settle:vi.fn().mockResolvedValue(undefined)};
  const service=new GovernedModelService(budgets as any);
  const result=await service.complete('request-a',request);
  expect(result.model).toBe('synthetic:anthropic');
  expect(result.actualCostMicros).toBe(0);
  expect(budgets.reserve).toHaveBeenCalledTimes(1);
  expect(budgets.settle).toHaveBeenCalledTimes(1);
 });
 it('rejects malformed env provider and unknown scenario rather than enabling real adapters',()=>{
  vi.stubEnv('MARKETING_MODEL_PROVIDER','simulation');
  vi.stubEnv('MARKETING_SIMULATED_MODEL_PROVIDER','REMOTE_HTTP');
  expect(()=>new GovernedModelService({} as any)).toThrow('Unknown model provider');
  vi.stubEnv('MARKETING_SIMULATED_MODEL_PROVIDER','LOCAL');
  vi.stubEnv('MARKETING_SIMULATED_MODEL_SCENARIO','REAL_POST');
  expect(()=>new GovernedModelService({} as any)).toThrow('Unknown model simulation');
 });
 it('routes to exact tenant+agent only, without cross-tenant or global fallback',async()=>{
  const openai=new SimulatedModelAdapter({providerKey:'OPENAI',scenario:'SUCCESS'});
  const gemini=new SimulatedModelAdapter({providerKey:'GEMINI',scenario:'SUCCESS'});
  const router=new GovernedModelRouter({
   scopeMode:'EXACT_TENANT',
   routes:[
    {organizationId:'tenant-a',agentId:request.agentId,purpose:request.purpose,providerKey:'OPENAI'},
    {organizationId:'tenant-b',agentId:request.agentId,purpose:request.purpose,providerKey:'GEMINI'}
   ],
   adapters:{OPENAI:openai,GEMINI:gemini}
  });
  const gateway=new BoundedModelGateway(router);
  expect((await gateway.complete(request)).model).toBe('synthetic:openai');
  expect((await gateway.complete({...request,organizationId:'tenant-b'})).model)
   .toBe('synthetic:gemini');
  await expect(gateway.complete({...request,organizationId:'tenant-c'}))
   .rejects.toThrow('No authorized provider route');
  await expect(gateway.complete({...request,agentId:'MKT-SCI-001'}))
   .rejects.toThrow('No authorized provider route');
  expect(()=>new GovernedModelRouter({
   scopeMode:'EXACT_TENANT',routes:[{agentId:request.agentId,
    purpose:request.purpose,providerKey:'OPENAI'}],adapters:{OPENAI:openai}
  })).toThrow('Exact tenant');
  expect(()=>new GovernedModelRouter({
   routes:[{organizationId:'tenant-a',agentId:request.agentId,
    purpose:request.purpose,providerKey:'OPENAI'}],adapters:{OPENAI:openai}
  })).toThrow('Global model routes');
  expect(()=>new GovernedModelRouter({
   scopeMode:'EXACT_TENANT',routes:[
    {organizationId:'tenant-a',agentId:request.agentId,purpose:request.purpose,providerKey:'OPENAI'},
    {organizationId:'tenant-a',agentId:request.agentId,purpose:request.purpose,providerKey:'GEMINI'}
   ],adapters:{OPENAI:openai,GEMINI:gemini}
  })).toThrow('Duplicate governed model route');
 });
 it('uses only server-owned tenant routing configuration in offline simulation',async()=>{
  const config=JSON.stringify({
   'tenant-a':{'MKT-CMO-001':'ANTHROPIC'},
   'tenant-b':{'MKT-CMO-001':'GEMINI','MKT-SCI-001':'LOCAL'}
  });
  expect(parseSimulatedTenantRoutes(config)).toHaveLength(3);
  vi.stubEnv('MARKETING_MODEL_PROVIDER','simulation');
  vi.stubEnv('MARKETING_SIMULATED_MODEL_TENANT_ROUTES_JSON',config);
  vi.stubEnv('MARKETING_SIMULATED_MODEL_PROVIDER','LOCAL');
  const budgets={reserve:vi.fn().mockResolvedValue({id:'reservation',replay:false}),
   settle:vi.fn().mockResolvedValue(undefined)};
  const service=new GovernedModelService(budgets as any);
  expect((await service.complete('tenant-a-request',request)).model)
   .toBe('synthetic:anthropic');
  expect((await service.complete('tenant-b-request',
   {...request,organizationId:'tenant-b'})).model).toBe('synthetic:gemini');
  await expect(service.complete('tenant-c-request',
   {...request,organizationId:'tenant-c'})).rejects.toThrow('No authorized provider route');
  expect(budgets.settle).toHaveBeenCalledTimes(2);
  for(const invalid of [
   '{}','[]','{"tenant-a":{"FAKE-AGENT":"OPENAI"}}',
   '{"tenant-a":{"MKT-CMO-001":"UNREVIEWED"}}',
   '{"tenant-a":[]}','{"tenant-a":{}}',
   JSON.stringify({'../../tenant':{'MKT-CMO-001':'OPENAI'}})
  ])expect(()=>parseSimulatedTenantRoutes(invalid)).toThrow();
 });

});
