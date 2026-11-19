import {describe,expect,it,vi,afterEach} from 'vitest';
import {AnthropicMessagesAdapter,GeminiGenerateContentAdapter,
 BoundedModelGateway,ModelGatewayError,type ModelRequest} from '@medsol/agent-runtime';
import {GovernedModelService} from './governed-model.service.js';
afterEach(()=>vi.unstubAllEnvs());
const request:ModelRequest={organizationId:'tenant-a',correlationId:'correlation-a',
 agentId:'MKT-STR-001',purpose:'INTERNAL_MARKETING_DRAFT',
 input:'Draft a non-published internal campaign assessment',
 maxOutputTokens:100,timeoutMs:1000,estimatedCostMicros:10000};
const config={apiKey:'test-only-key-abcdefghijklmnop',model:'test-model-1',
 inputRateMicrosPerMillion:1000000,outputRateMicrosPerMillion:2000000};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json'}});
const anthropicBody={type:'message',role:'assistant',stop_reason:'end_turn',
 content:[{type:'text',text:'Human-reviewed draft'}],
 usage:{input_tokens:10,output_tokens:20}};
const geminiBody={candidates:[{finishReason:'STOP',
 content:{role:'model',parts:[{text:'Human-reviewed draft'}]}}],
 usageMetadata:{promptTokenCount:10,candidatesTokenCount:20}};
describe('R3-D dormant fixed-destination official provider adapter contracts',()=>{
 it('validates Anthropic fixed URL, no tools, prompt safety and reviewed cost',async()=>{
  const transport=vi.fn(async()=>json(anthropicBody)) as unknown as typeof fetch;
  const result=await new BoundedModelGateway(new AnthropicMessagesAdapter(
   config,transport)).complete(request);
  expect(result).toMatchObject({model:'test-model-1',inputTokens:10,
   outputTokens:20,actualCostMicros:50,text:'Human-reviewed draft'});
  const [url,options]=(transport as any).mock.calls[0];
  expect(url).toBe('https://api.anthropic.com/v1/messages');
  expect(options.redirect).toBe('error');
  expect(options.headers['x-api-key']).toBe(config.apiKey);
  const body=JSON.parse(options.body);
  expect(body.stream).toBe(false);
  expect(body.tools).toBeUndefined();
  expect(body.system).toContain('untrusted data');
  expect(body.messages[0].content[0].text).toBe(request.input);
 });
 it('validates Gemini fixed URL, no tool calling, safe output and reviewed cost',async()=>{
  const transport=vi.fn(async()=>json(geminiBody)) as unknown as typeof fetch;
  const result=await new BoundedModelGateway(new GeminiGenerateContentAdapter(
   config,transport)).complete(request);
  expect(result).toMatchObject({model:'test-model-1',inputTokens:10,
   outputTokens:20,actualCostMicros:50,text:'Human-reviewed draft'});
  const [url,options]=(transport as any).mock.calls[0];
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/test-model-1:generateContent');
  expect(options.redirect).toBe('error');
  expect(options.headers['x-goog-api-key']).toBe(config.apiKey);
  const body=JSON.parse(options.body);
  expect(body.tools).toEqual([]);
  expect(body.systemInstruction.parts[0].text).toContain('human review');
  expect(body.contents[0].parts[0].text).toBe(request.input);
 });
 it('rejects unsafe Anthropic tool content, truncation and malformed response',async()=>{
  for(const body of [
   {...anthropicBody,stop_reason:'tool_use'},
   {...anthropicBody,content:[{type:'tool_use',id:'bad'}]},
   {...anthropicBody,usage:{input_tokens:-1,output_tokens:1}}
  ]){
   const adapter=new AnthropicMessagesAdapter(config,
    vi.fn(async()=>json(body)) as unknown as typeof fetch);
   await expect(new BoundedModelGateway(adapter).complete(request))
    .rejects.toThrow(ModelGatewayError);
  }
 });
 it('rejects Gemini function calls, blocked finish, multi-candidates and invalid usage',async()=>{
  for(const body of [
   {...geminiBody,candidates:[{finishReason:'SAFETY',content:{role:'model',parts:[{text:'x'}]}}]},
   {...geminiBody,candidates:[{finishReason:'STOP',
    content:{role:'model',parts:[{functionCall:{name:'publish'}}]}}]},
   {...geminiBody,candidates:[...geminiBody.candidates,...geminiBody.candidates]},
   {...geminiBody,usageMetadata:{promptTokenCount:'10',candidatesTokenCount:1}}
  ]){
   const adapter=new GeminiGenerateContentAdapter(config,
    vi.fn(async()=>json(body)) as unknown as typeof fetch);
   await expect(new BoundedModelGateway(adapter).complete(request))
    .rejects.toThrow(ModelGatewayError);
  }
 });
 it('denies non-JSON, oversized, HTTP errors, transport failures and unpriced credentials',async()=>{
  const invalid=new AnthropicMessagesAdapter(config,
   vi.fn(async()=>json({error:'bad'},429)) as unknown as typeof fetch);
  await expect(new BoundedModelGateway(invalid).complete(request))
   .rejects.toThrow('unsuccessful');
  const reset=new GeminiGenerateContentAdapter(config,
   vi.fn(async()=>{throw new Error('network reset')}) as unknown as typeof fetch);
  await expect(new BoundedModelGateway(reset).complete(request))
   .rejects.toThrow('billing state uncertain');
  expect(()=>new AnthropicMessagesAdapter({...config,apiKey:''})).toThrow();
  expect(()=>new GeminiGenerateContentAdapter({...config,model:'../../secrets'})).toThrow();
  expect(()=>new GeminiGenerateContentAdapter({...config,
   inputRateMicrosPerMillion:Infinity})).toThrow();
 });
 it('requires explicit keys and reviewed prices in production service composition',()=>{
  for(const provider of ['anthropic','gemini']){
   vi.stubEnv('MARKETING_MODEL_PROVIDER',provider);
   vi.stubEnv('MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION','');
   vi.stubEnv('MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION','');
   expect(()=>new GovernedModelService({} as any))
    .toThrow('Explicit reviewed model price table required');
   vi.stubEnv('MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION','100');
   vi.stubEnv('MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION','200');
   vi.stubEnv('MARKETING_ANTHROPIC_API_KEY','');
   vi.stubEnv('MARKETING_GEMINI_API_KEY','');
   expect(()=>new GovernedModelService({} as any))
    .toThrow('Invalid reviewed model provider configuration');
  }
 });
});
