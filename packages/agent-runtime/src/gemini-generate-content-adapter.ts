import {ModelGatewayError,type ModelAdapter,type ModelRequest,type ModelResult}
 from './model-gateway.js';
import {SAFE_MARKETING_MODEL_SYSTEM_PROMPT,validateReviewedModelConfig,
 readBoundedProviderJson,providerObject,modelTokenCount,estimatedModelCost,
 type ReviewedModelConfig} from './provider-adapter-contract.js';

/**
 * Google Gemini generateContent text-only transport contract. No account
 * connected now. Model ID is constrained, endpoint fixed, tools disabled,
 * no URL chosen by a user/agent, no implicit retries or external actions.
 * Actual provider acceptance is a future credentialed staging gate.
 */
export class GeminiGenerateContentAdapter implements ModelAdapter{
 private readonly config:ReviewedModelConfig;
 constructor(config:ReviewedModelConfig,private readonly transport:typeof fetch=fetch){
  this.config=validateReviewedModelConfig(config);
 }
 async complete(request:ModelRequest,signal:AbortSignal):Promise<ModelResult>{
  let response:Response;
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+
   encodeURIComponent(this.config.model)+':generateContent';
  try{
   response=await this.transport(url,{
    method:'POST',redirect:'error',signal,
    headers:{'x-goog-api-key':this.config.apiKey,
     'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({
     systemInstruction:{parts:[{text:SAFE_MARKETING_MODEL_SYSTEM_PROMPT}]},
     contents:[{role:'user',parts:[{text:request.input}]}],
     generationConfig:{maxOutputTokens:request.maxOutputTokens},
     tools:[]
    })
   });
  }catch{throw new ModelGatewayError('Gemini request failed; billing state uncertain');}
  const body=providerObject(await readBoundedProviderJson(response));
  if(!Array.isArray(body.candidates)||body.candidates.length!==1)
   throw new ModelGatewayError('Gemini must return one bounded candidate');
  const candidate=providerObject(body.candidates[0]);
  if(candidate.finishReason!=='STOP')
   throw new ModelGatewayError('Gemini candidate not safely completed');
  const content=providerObject(candidate.content);
  if(content.role!=='model'||!Array.isArray(content.parts))
   throw new ModelGatewayError('Gemini returned invalid content');
  const parts=content.parts as unknown[];
  if(parts.some(x=>!x||typeof x!=='object'||Array.isArray(x)||
    typeof (x as {text?:unknown}).text!=='string'||
    Object.keys(x as Record<string,unknown>).some(k=>k!=='text')))
   throw new ModelGatewayError('Gemini returned non-text or tool content');
  const text=parts.map(x=>(x as {text:string}).text).join('\n');
  if(!text.trim())throw new ModelGatewayError('Gemini produced no draft');
  const usage=providerObject(body.usageMetadata);
  const inputTokens=modelTokenCount(usage.promptTokenCount,'prompt tokens');
  const outputTokens=modelTokenCount(usage.candidatesTokenCount,'candidate tokens');
  const cost=estimatedModelCost(inputTokens,outputTokens,this.config);
  return{text,inputTokens,outputTokens,actualCostMicros:cost,model:this.config.model};
 }
}
