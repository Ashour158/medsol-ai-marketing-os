import { Injectable } from '@nestjs/common';
import { BoundedModelGateway, DisabledModelAdapter, ModelRequestSchema, type ModelAdapter, type ModelResult } from '@medsol/agent-runtime';
import { ModelBudgetService } from './model-budget.service.js';

@Injectable()
export class GovernedModelService {
  private readonly gateway: BoundedModelGateway;
  constructor(private readonly budgets: ModelBudgetService) {
    this.gateway = new BoundedModelGateway(new DisabledModelAdapter());
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
