import {AGENT_ROSTER} from './roster.js';
import {ModelGatewayError,type ModelAdapter,type ModelRequest,type ModelResult}
 from './model-gateway.js';

/**
 * R3-C provider-neutral routing foundation, server-configured and fail-closed.
 * This module owns no model budget or agent identity: those remain with
 * ModelBudgetService and AgentRuntime. No model, HTTP or credentials are
 * accessed by the simulator.
 */
export const MODEL_PROVIDER_KEYS=['OPENAI','ANTHROPIC','GEMINI','LOCAL'] as const;
export type ModelProviderKey=typeof MODEL_PROVIDER_KEYS[number];
export const MODEL_SIMULATION_SCENARIOS=[
 'SUCCESS','POLICY_REJECTED','RATE_LIMITED','INVALID_CREDENTIAL',
 'PROVIDER_5XX','TIMEOUT_AFTER_ACCEPT','MALFORMED_RESULT'
] as const;
export type ModelSimulationScenario=typeof MODEL_SIMULATION_SCENARIOS[number];
export function assertModelProviderKey(raw:unknown):ModelProviderKey{
 if(typeof raw!=='string'||!MODEL_PROVIDER_KEYS.some(x=>x===raw))
  throw new ModelGatewayError('Unknown model provider in governed route');
 return raw as ModelProviderKey;
}
export function assertModelSimulationScenario(raw:unknown):ModelSimulationScenario{
 if(typeof raw!=='string'||!MODEL_SIMULATION_SCENARIOS.some(x=>x===raw))
  throw new ModelGatewayError('Unknown model simulation scenario');
 return raw as ModelSimulationScenario;
}
export type ModelRoute={organizationId?:string;agentId:string;purpose:string;providerKey:ModelProviderKey};
export type ModelRouteScope="SERVER_GLOBAL"|"EXACT_TENANT";
/** No implicit default, no automatic failover after a possibly billed call. */
export class GovernedModelRouter implements ModelAdapter{
 private readonly routes=new Map<string,ModelProviderKey>();
 private readonly adapters=new Map<ModelProviderKey,ModelAdapter>();
 private readonly scopeMode:ModelRouteScope;
 constructor(input:{routes:readonly ModelRoute[];scopeMode?:ModelRouteScope;
  adapters:Readonly<Partial<Record<ModelProviderKey,ModelAdapter>>>}){
  this.scopeMode=input.scopeMode??"SERVER_GLOBAL";
  if(!["SERVER_GLOBAL","EXACT_TENANT"].includes(this.scopeMode))
   throw new ModelGatewayError("Unknown model route scope mode");
  if(input.routes.length<1||input.routes.length>100)
   throw new ModelGatewayError('Governed route count must be bounded');
  for(const [provider,adapter] of Object.entries(input.adapters)){
   const key=assertModelProviderKey(provider);
   if(!adapter||typeof adapter.complete!=='function')
    throw new ModelGatewayError('Provider adapter must be configured');
   this.adapters.set(key,adapter);
  }
  for(const route of input.routes){
   if(!AGENT_ROSTER.some(a=>a.id===route.agentId))
    throw new ModelGatewayError('Route requires canonical agent identity');
   if(!/^[A-Z][A-Z0-9_]{2,79}$/.test(route.purpose))
    throw new ModelGatewayError('Route requires fixed internal purpose');
   const scoped=this.scopeMode==="EXACT_TENANT";
   if(scoped&&
      (typeof route.organizationId!=="string"||
       !/^[A-Za-z0-9_-]{3,160}$/.test(route.organizationId)))
    throw new ModelGatewayError("Exact tenant model route must name one bounded organization");
   if(!scoped&&route.organizationId!==undefined)
    throw new ModelGatewayError("Global model routes cannot conceal tenant overrides");
   const provider=assertModelProviderKey(route.providerKey);
   if(!this.adapters.has(provider))
    throw new ModelGatewayError('Route provider has no configured adapter');
   const key=(scoped?route.organizationId:"SERVER_GLOBAL")+'\0'+route.agentId+'\0'+route.purpose;
   if(this.routes.has(key))
    throw new ModelGatewayError('Duplicate governed model route');
   this.routes.set(key,provider);
  }
 }
 async complete(request:ModelRequest,signal:AbortSignal):Promise<ModelResult>{
  if(signal.aborted)throw new ModelGatewayError('Model request already cancelled');
  const scope=this.scopeMode==="EXACT_TENANT"?request.organizationId:"SERVER_GLOBAL";
  const provider=this.routes.get(scope+'\0'+request.agentId+'\0'+request.purpose);
  if(!provider)throw new ModelGatewayError('No authorized provider route for agent and purpose');
  const adapter=this.adapters.get(provider);
  if(!adapter)throw new ModelGatewayError('Provider adapter unavailable');
  // A failed/ambiguous adapter is never retried against another provider.
  return adapter.complete(request,signal);
 }
}
/** Offline, deterministic model-provider protocol simulation, NOT AI inference. */
export class SimulatedModelAdapter implements ModelAdapter{
 readonly providerKey:ModelProviderKey;
 readonly scenario:ModelSimulationScenario;
 constructor(config:{providerKey:ModelProviderKey;scenario:ModelSimulationScenario}){
  this.providerKey=assertModelProviderKey(config.providerKey);
  this.scenario=assertModelSimulationScenario(config.scenario);
 }
 async complete(request:ModelRequest,signal:AbortSignal):Promise<ModelResult>{
  if(signal.aborted)throw new ModelGatewayError('Synthetic model request cancelled');
  if(this.scenario!=='SUCCESS')
   throw new ModelGatewayError('SIMULATED_'+this.scenario+
    ': no provider request was made; no automatic retry is authorized');
  // Deliberately non-cryptographic display marker, never an authorization
  // digest or source-evidence claim. Avoid a Node crypto dependency in the
  // environment-neutral agent-runtime package.
  const marker=JSON.stringify(['offline-model-v1',this.providerKey,
   request.correlationId,request.agentId,request.purpose]);
  let checksum=2166136261;
  for(let i=0;i<marker.length;i++)
   checksum=Math.imul(checksum^marker.charCodeAt(i),16777619);
  const fingerprint=(checksum>>>0).toString(16).padStart(8,'0');
  const text='[SYNTHETIC '+this.providerKey+' MODEL — NO AI INFERENCE] '+
   'Offline provider contract test '+fingerprint+
   '. Human review required; no claims, sources or advice generated.';
  return{text,inputTokens:Math.min(100000000,Math.ceil(request.input.length/4)),
   outputTokens:Math.min(request.maxOutputTokens,Math.ceil(text.length/4)),
   actualCostMicros:0,model:'synthetic:'+this.providerKey.toLowerCase()};
 }
}
