import { Injectable } from '@nestjs/common';
import { BoundedModelGateway, DisabledModelAdapter, ModelRequestSchema, type ModelAdapter, type ModelResult, OpenAIResponsesAdapter, AGENT_ROSTER, GovernedModelRouter, SimulatedModelAdapter, assertModelProviderKey, assertModelSimulationScenario, AnthropicMessagesAdapter, GeminiGenerateContentAdapter, type ModelRoute } from '@medsol/agent-runtime';
import { ModelBudgetService } from './model-budget.service.js';
import type {Prisma} from '@prisma/client';
import {specialistBudgetRequestId,specialistBudgetReceipt,SPECIALIST_FIXTURE_RESERVE_MICROS} from './specialist-model-budget-rehearsal.js';
import {prepareStructuredDraftFixture,structuredDraftFixture,structuredDraftFixtureReceipt} from './specialist-structured-model-draft.js';


/** Server-configured, simulation-only per-tenant/agent routing; never user-selected.
 * Missing routes are DENIED, without falling back to a different tenant or
 * globally shared provider. No keys, network destinations or model calls.
 */
export function parseSimulatedTenantRoutes(raw:string):ModelRoute[]{
 if(raw.length>20000)throw Error("Bounded tenant model routing configuration required");
 let data:unknown;
 try{data=JSON.parse(raw)}catch{throw Error("Invalid tenant model routing JSON");}
 if(!data||typeof data!=="object"||Array.isArray(data))
  throw Error("Tenant model routing must map organizations to canonical agent routes");
 const tenants=Object.entries(data as Record<string,unknown>);
 if(tenants.length<1||tenants.length>20)
  throw Error("Tenant model route count must be between 1 and 20");
 const routes:ModelRoute[]=[];
 for(const [organizationId,agentConfig] of tenants){
  if(!/^[A-Za-z0-9_-]{3,160}$/.test(organizationId)||
     !agentConfig||typeof agentConfig!=="object"||Array.isArray(agentConfig))
   throw Error("Invalid exact tenant model route");
  const entries=Object.entries(agentConfig as Record<string,unknown>);
  if(entries.length<1||entries.length>13)
   throw Error("Tenant agent model routing must be bounded");
  for(const [agentId,rawProvider] of entries){
   if(!AGENT_ROSTER.some(agent=>agent.id===agentId))
    throw Error("Tenant model routing requires canonical agent");
   const providerKey=assertModelProviderKey(rawProvider);
   routes.push({organizationId,agentId,
    purpose:"INTERNAL_MARKETING_DRAFT",providerKey});
  }
 }
 if(routes.length>100)throw Error("Tenant model route count exceeds safe bound");
 return routes;
}

@Injectable()
export class GovernedModelService {
  private readonly gateway: BoundedModelGateway;
  constructor(private readonly budgets: ModelBudgetService) {
    const provider = process.env.MARKETING_MODEL_PROVIDER ?? 'disabled';
    let adapter: ModelAdapter;
    if (provider === 'disabled') {
      adapter = new DisabledModelAdapter();
    } else if (provider === 'simulation') {
      // Explicit operator-only environment selection; never a customer-supplied
      // provider, never a real network call, never a claim of AI inference.
      const selected = assertModelProviderKey(
        process.env.MARKETING_SIMULATED_MODEL_PROVIDER ?? 'LOCAL');
      const scenario = assertModelSimulationScenario(
        process.env.MARKETING_SIMULATED_MODEL_SCENARIO ?? 'SUCCESS');
      const adapters = {
        OPENAI:new SimulatedModelAdapter({providerKey:'OPENAI',scenario}),
        ANTHROPIC:new SimulatedModelAdapter({providerKey:'ANTHROPIC',scenario}),
        GEMINI:new SimulatedModelAdapter({providerKey:'GEMINI',scenario}),
        LOCAL:new SimulatedModelAdapter({providerKey:'LOCAL',scenario})
      };
      const tenantRoutes=process.env.MARKETING_SIMULATED_MODEL_TENANT_ROUTES_JSON;
      adapter = new GovernedModelRouter({
        scopeMode:tenantRoutes?"EXACT_TENANT":"SERVER_GLOBAL",
        routes:tenantRoutes?parseSimulatedTenantRoutes(tenantRoutes):
          AGENT_ROSTER.map(agent=>({
           agentId:agent.id,purpose:"INTERNAL_MARKETING_DRAFT",
           providerKey:selected
          })),adapters
      });
    } else if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY ?? '';
      const model = process.env.MARKETING_OPENAI_MODEL ?? '';
      const inputRate = Number(process.env.MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION);
      const outputRate = Number(process.env.MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION);
      if (!process.env.MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION || !process.env.MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION) {
        throw new Error('Explicit reviewed model price table required');
      }
      adapter = new OpenAIResponsesAdapter({apiKey:key,model,inputRateMicrosPerMillion:inputRate,outputRateMicrosPerMillion:outputRate});
    } else if (provider === 'anthropic' || provider === 'gemini') {
      // Credentials are NOT configured or connected during software build.
      // Enabling this branch later requires an explicit reviewed key, model
      // and price table. Provider responses remain unverified until staging.
      const inputPrice=process.env.MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION;
      const outputPrice=process.env.MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION;
      if (!inputPrice || !outputPrice)
        throw new Error('Explicit reviewed model price table required');
      const config={
        apiKey:provider==='anthropic'?
          process.env.MARKETING_ANTHROPIC_API_KEY??'':
          process.env.MARKETING_GEMINI_API_KEY??'',
        model:provider==='anthropic'?
          process.env.MARKETING_ANTHROPIC_MODEL??'':
          process.env.MARKETING_GEMINI_MODEL??'',
        inputRateMicrosPerMillion:Number(inputPrice),
        outputRateMicrosPerMillion:Number(outputPrice)
      };
      adapter=provider==='anthropic'?
        new AnthropicMessagesAdapter(config):new GeminiGenerateContentAdapter(config);
    } else {
      throw new Error('Unknown marketing model provider (fail closed)');
    }
    this.gateway = new BoundedModelGateway(adapter);
  }
  /** Fixed, nonbillable protocol fixture. Never touches the configured live
   * adapter or spending ledger; only the same bounded router and synthetic adapters.
   * The caller must own the reviewed tenant execution and canonical template pin.
   */
  async rehearseSpecialistContracts(input:{organizationId:string;correlationId:string;agentId:string;decisionDigest:string}){
    if(process.env.MARKETING_AI_REASONING_ENABLED==='true'||!/^sha256:[0-9a-f]{64}$/.test(input.decisionDigest))
      throw new Error('Offline specialist contract rehearsal required');
    const results=[];
    for(const providerKey of ['OPENAI','ANTHROPIC','GEMINI','LOCAL'] as const){
      const adapter=new SimulatedModelAdapter({providerKey,scenario:'SUCCESS'});
      const route=new GovernedModelRouter({scopeMode:'EXACT_TENANT',routes:[{organizationId:input.organizationId,agentId:input.agentId,purpose:'INTERNAL_MARKETING_DRAFT',providerKey}],adapters:{[providerKey]:adapter}});
      const gateway=new BoundedModelGateway(route);
      const result=await gateway.complete({organizationId:input.organizationId,correlationId:input.correlationId,agentId:input.agentId,purpose:'INTERNAL_MARKETING_DRAFT',input:JSON.stringify({fixture:'specialist-contract-v1',decisionDigest:input.decisionDigest}),maxOutputTokens:256,timeoutMs:1000,estimatedCostMicros:0});
      if(result.actualCostMicros!==0||result.model!=='synthetic:'+providerKey.toLowerCase()||!result.text.startsWith('[SYNTHETIC '+providerKey+' MODEL — NO AI INFERENCE]'))
        throw new Error('Unexpected synthetic provider contract');
      results.push({providerKey,model:result.model,inputTokens:result.inputTokens,outputTokens:result.outputTokens,actualCostMicros:0,passed:true as const});
    }
    return{schema:'medsol.specialist-provider-contracts.v1',decisionDigest:input.decisionDigest,results,providerRequestsMade:0,realModelInvocations:0,actualCostMicros:0,modelQualityEvaluated:false,externalEffectsAuthorized:false};
  }
  /** Reviewed nonbillable fixture only; cannot access the configured adapter. */
  async rehearseStructuredSpecialistDraft(input:Parameters<typeof prepareStructuredDraftFixture>[0]){
    if(process.env.MARKETING_AI_REASONING_ENABLED==='true')throw new Error('Structured specialist fixture requires offline reasoning');
    const prepared=prepareStructuredDraftFixture(input);
    const adapter:ModelAdapter={complete:async(request,signal)=>{
      if(signal.aborted||JSON.stringify(request)!==JSON.stringify(prepared.request))throw new Error('Unexpected structured fixture request');
      return structuredDraftFixture(prepared);
    }};
    const gateway=new BoundedModelGateway(new GovernedModelRouter({scopeMode:'EXACT_TENANT',routes:[{organizationId:input.organizationId,agentId:input.templateAgentId,purpose:'INTERNAL_MARKETING_DRAFT',providerKey:'LOCAL'}],adapters:{LOCAL:adapter}}));
    return structuredDraftFixtureReceipt(prepared,await gateway.complete(prepared.request));
  }
  /** Explicit reviewed capacity rehearsal. A real budget reservation is made
   * and released in the caller's transaction; only a fixed local response is
   * executed. No external disclosure, configured provider, billed usage or
   * nested transaction. A failure rolls back both reservation and execution.
   */
  async rehearseBudgetedSpecialistDraft(tx:Prisma.TransactionClient,input:Parameters<typeof prepareStructuredDraftFixture>[0]){
    if(process.env.MARKETING_AI_REASONING_ENABLED==='true')throw new Error('Offline budget rehearsal required');
    const prepared=prepareStructuredDraftFixture(input);
    const requestId=specialistBudgetRequestId(input.organizationId,input.approvalId,input.scopeDigest,prepared.requestDigest);
    const reserved=await this.budgets.reserveInTransaction(tx,{organizationId:input.organizationId,requestId,agentId:input.templateAgentId,costMicros:SPECIALIST_FIXTURE_RESERVE_MICROS});
    if(reserved.replay||reserved.status!=='RESERVED')throw new Error('Unexpected existing offline budget reservation');
    const draft=await this.rehearseStructuredSpecialistDraft(input);
    if(draft.requestDigest!==prepared.requestDigest||draft.actualCostMicros!==0||draft.providerRequestsMade!==0||draft.realModelInvocations!==0)throw new Error('Offline budget rehearsal must remain nonbillable');
    const released=await this.budgets.settleInTransaction(tx,input.organizationId,reserved.id,null);
    if(released.replay||released.status!=='RELEASED')throw new Error('Offline model budget release failed');
    return{draft,budgetReceipt:specialistBudgetReceipt(requestId,reserved.id)};
  }
  // Adapter injection is restricted to server-side composition; no agent may select arbitrary network destinations.
  async complete(requestId: string, raw: unknown): Promise<ModelResult> {
    const request = ModelRequestSchema.parse(raw);
    const reserved = await this.budgets.reserve({ organizationId: request.organizationId, requestId, agentId: request.agentId, costMicros: request.estimatedCostMicros });
    if (reserved.replay) throw new Error('Model request already reserved or completed; replay requires retrieving authoritative ledger state');
    let result: ModelResult;
    try {
      result = await this.gateway.complete(request);
    } catch (error) {
      // A timed-out provider may still bill after cancellation; retain reservation
      // until reconciliation rather than releasing money that might have been spent.
      throw error;
    }
    await this.budgets.settle(request.organizationId, reserved.id, result);
    return result;
  }
}
