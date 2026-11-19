import {ModelGatewayError,type ModelAdapter,type ModelRequest,type ModelResult}
 from './model-gateway.js';
import {SAFE_MARKETING_MODEL_SYSTEM_PROMPT,validateReviewedModelConfig,
 readBoundedProviderJson,providerObject,modelTokenCount,estimatedModelCost,
 type ReviewedModelConfig} from './provider-adapter-contract.js';

/**
 * Official Anthropic Messages shape, transport contract only. No key is
 * configured by default. Fixed endpoint, no tools, no MCP, no web and no
 * retries after ambiguous/billed calls. Staging provider acceptance pending.
 */
export class AnthropicMessagesAdapter implements ModelAdapter{
 private readonly config:ReviewedModelConfig;
 constructor(config:ReviewedModelConfig,private readonly transport:typeof fetch=fetch){
  this.config=validateReviewedModelConfig(config);
 }
 async complete(request:ModelRequest,signal:AbortSignal):Promise<ModelResult>{
  let response:Response;
  try{
   response=await this.transport('https://api.anthropic.com/v1/messages',{
    method:'POST',redirect:'error',signal,
    headers:{'x-api-key':this.config.apiKey,'anthropic-version':'2023-06-01',
     'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({model:this.config.model,max_tokens:request.maxOutputTokens,
     stream:false,system:SAFE_MARKETING_MODEL_SYSTEM_PROMPT,
     messages:[{role:'user',content:[{type:'text',text:request.input}]}]})
   });
  }catch{throw new ModelGatewayError('Anthropic request failed; billing state uncertain');}
  const body=providerObject(await readBoundedProviderJson(response));
  if(body.type!=='message'||body.role!=='assistant'||
     body.stop_reason!=='end_turn'||!Array.isArray(body.content))
   throw new ModelGatewayError('Anthropic message not safely completed');
  const blocks=body.content as unknown[];
  if(blocks.some(x=>!x||typeof x!=='object'||Array.isArray(x)||
    (x as {type?:unknown}).type!=='text'))
   throw new ModelGatewayError('Anthropic returned non-text or tool content');
  const text=blocks.map(x=>(x as {text?:unknown}).text)
   .map(x=>typeof x==='string'?x:'').join('\n');
  if(!text.trim())throw new ModelGatewayError('Anthropic produced no draft');
  const usage=providerObject(body.usage);
  const inputTokens=modelTokenCount(usage.input_tokens,'input tokens');
  const outputTokens=modelTokenCount(usage.output_tokens,'output tokens');
  const cost=estimatedModelCost(inputTokens,outputTokens,this.config);
  return{text,inputTokens,outputTokens,actualCostMicros:cost,model:this.config.model};
 }
}
