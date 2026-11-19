import { Injectable } from '@nestjs/common';
import { BoundedModelGateway, DisabledModelAdapter, ModelRequestSchema, type ModelAdapter, type ModelResult, OpenAIResponsesAdapter, AGENT_ROSTER, GovernedModelRouter, SimulatedModelAdapter, assertModelProviderKey, assertModelSimulationScenario, AnthropicMessagesAdapter, GeminiGenerateContentAdapter } from '@medsol/agent-runtime';
import { ModelBudgetService } from './model-budget.service.js';

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
      adapter = new GovernedModelRouter({
        routes:AGENT_ROSTER.map(agent=>({
          agentId:agent.id,purpose:'INTERNAL_MARKETING_DRAFT',
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
