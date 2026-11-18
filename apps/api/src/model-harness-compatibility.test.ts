import {describe,expect,it,vi,afterEach} from 'vitest';
import {GovernedModelService} from './governed-model.service.js';

afterEach(()=>vi.unstubAllEnvs());
describe('tested provider/harness compatibility boundary',()=>{
 it('is disabled by default without accepting arbitrary model traffic',async()=>{
  vi.stubEnv('MARKETING_MODEL_PROVIDER','disabled');
  const service=new GovernedModelService({reserve:vi.fn().mockResolvedValue({id:'reservation-a',replay:false}),settle:vi.fn()} as any);
  const request={organizationId:'tenant-a',correlationId:'corr-a',agentId:'MKT-STR-001',
   purpose:'INTERNAL_MARKETING_DRAFT',input:'Draft only',maxOutputTokens:100,
   timeoutMs:1000,estimatedCostMicros:100};
  // Budget authority still precedes the adapter; absent tenant budget denies execution.
  await expect(service.complete('request-a',request)).rejects.toThrow('disabled until explicitly configured');
 });
 it.each(['claude','codex','opencode','zed','dmux','agent-surface'])(
  'rejects unimplemented %s as a model provider',provider=>{
   vi.stubEnv('MARKETING_MODEL_PROVIDER',provider);
   expect(()=>new GovernedModelService({} as any)).toThrow('Unknown marketing model provider');
  }
 );
 it('rejects incomplete OpenAI provider configuration rather than silently falling back',()=>{
  vi.stubEnv('MARKETING_MODEL_PROVIDER','openai');
  vi.stubEnv('OPENAI_API_KEY','');
  vi.stubEnv('MARKETING_OPENAI_MODEL','');
  vi.stubEnv('MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION','');
  vi.stubEnv('MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION','');
  expect(()=>new GovernedModelService({} as any)).toThrow('Explicit reviewed model price table required');
 });
});
