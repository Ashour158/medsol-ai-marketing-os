import { describe,it,expect,vi,afterEach } from 'vitest';
import { OpenAIResponsesAdapter, ModelGatewayError, BoundedModelGateway } from '@medsol/agent-runtime';
import { AgentService } from './agent.service.js';

afterEach(()=>vi.unstubAllEnvs());

const modelRequest={organizationId:'tenant',correlationId:'corr',agentId:'MKT-STR-001',purpose:'INTERNAL_MARKETING_DRAFT',
 input:'Make a referenced proposal',maxOutputTokens:300,timeoutMs:2000,estimatedCostMicros:1000};
const modelConfig={apiKey:'sk-unit-test-not-a-real-key',model:'model-approved-by-operator',
 inputRateMicrosPerMillion:1000000,outputRateMicrosPerMillion:2000000};

describe('fixed-destination governed model adapter',()=>{
 it('uses store=false, disables tools and calculates the configured estimated price',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,headers:{get:()=> 'application/json'},
   text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'DRAFT — verify before publishing'}]}],
    usage:{input_tokens:12,output_tokens:3}})});
  const gateway=new BoundedModelGateway(new OpenAIResponsesAdapter(modelConfig,fetcher));
  const result=await gateway.complete(modelRequest);
  expect(result.text).toContain('DRAFT');
  expect(result.actualCostMicros).toBe(18);
  const url=fetcher.mock.calls[0]![0];
  const options=fetcher.mock.calls[0]![1];
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(options.redirect).toBe('error');
  const body=JSON.parse(options.body);
  expect(body.tools).toEqual([]);
  expect(body.store).toBe(false);
  expect(body.background).toBe(false);
  expect(body.parallel_tool_calls).toBe(false);
 });
 it('rejects non-final outputs and malformed provider usage',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,headers:{get:()=> 'application/json'},
   text:async()=>JSON.stringify({status:'incomplete',output_text:'draft',usage:{input_tokens:4,output_tokens:4}})});
  const adapter=new OpenAIResponsesAdapter(modelConfig,fetcher);
  await expect(adapter.complete(modelRequest,new AbortController().signal)).rejects.toThrow('not completed');
 });
 it('cannot complete a request without an explicitly configured model',()=>{
  expect(()=>new OpenAIResponsesAdapter({...modelConfig,model:'',apiKey:''})).toThrow('configuration');
 });
});

describe('all marketing agents produce optional model-assisted but unreleased drafts',()=>{
 it('uses the central budget gateway and preserves human approval and no release flags',async()=>{
  vi.stubEnv('MARKETING_AI_REASONING_ENABLED','true');
  vi.stubEnv('MARKETING_MODEL_RESERVATION_MICROS','5000');
  const db:any={agent:{upsert:vi.fn().mockResolvedValue({status:'ACTIVE',version:1,capabilities:['EXTRACT_CLAIM','CHECK_EVIDENCE','BLOCK_UNSUPPORTED_CLAIM']})},agentExecution:{create:vi.fn().mockImplementation(async({data}:any)=>data),update:vi.fn().mockResolvedValue({})}};
  const model:any={complete:vi.fn().mockResolvedValue({text:'DRAFT: test recommendations',model:'test',
    actualCostMicros:300,inputTokens:10,outputTokens:10})};
  const service=new AgentService(db,model);
  const result=await service.execute('MKT-SCI-001',{organizationId:'tenant',correlationId:'corr',
   input:{requestedOutcome:'Develop scientifically reviewed education'},capabilities:['EXTRACT_CLAIM']});
  expect(model.complete).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({
   agentId:'MKT-SCI-001',organizationId:'tenant',estimatedCostMicros:5000
  }));
  const reasoning=(result.decision.payload as any).reasoningDraft;
  expect(reasoning.text).toContain('DRAFT');
  expect(reasoning.humanApproved).toBe(false);
  expect(reasoning.externalEffectsPermitted).toBe(false);
  expect(result.decision.approvalRequired).toBe(true);
 });
});
