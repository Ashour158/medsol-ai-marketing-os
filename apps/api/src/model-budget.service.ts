import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type ModelUsage } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class ModelBudgetService {
  constructor(private readonly db: PrismaService) {}
  async reserve(input: { organizationId: string; requestId: string; agentId: string; costMicros: number }) {
    const { organizationId, requestId, agentId, costMicros } = input;
    if (!organizationId || !requestId || !agentId || !Number.isSafeInteger(costMicros) || costMicros < 0 || costMicros > 100000000) throw new ForbiddenException('Invalid model reservation');
    return this.db.$transaction(async tx => {
      const prior = await tx.modelUsage.findUnique({ where: { organizationId_requestId: { organizationId, requestId } } });
      if (prior) {
        if (prior.agentId !== agentId || prior.reservedMicros !== BigInt(costMicros)) throw new ConflictException('Idempotency key reused with different model request');
        return { id: prior.id, status: prior.status, replay: true };
      }
      const budget = await tx.modelBudget.findUnique({ where: { organizationId } });
      if (!budget) throw new ForbiddenException('Model spending is disabled for this tenant');
      const reserve = BigInt(costMicros);
      if (budget.spentMicros + budget.reservedMicros + reserve > budget.limitMicros) throw new ForbiddenException('Model budget exceeded');
      await tx.modelBudget.update({ where: { organizationId }, data: { reservedMicros: { increment: reserve } } });
      const usage = await tx.modelUsage.create({ data: { organizationId, requestId, agentId, reservedMicros: reserve, status: 'RESERVED' } });
      return { id: usage.id, status: usage.status, replay: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async settle(organizationId: string, id: string, result: { actualCostMicros: number; model: string; inputTokens: number; outputTokens: number } | null) {
    return this.db.$transaction(async tx => {
      const usage = await tx.modelUsage.findFirst({ where: { id, organizationId } });
      if (!usage) throw new ForbiddenException('Model reservation not found in tenant');
      if (usage.status !== 'RESERVED') return { id: usage.id, status: usage.status, replay: true };
      if (result && (!Number.isSafeInteger(result.actualCostMicros) || result.actualCostMicros < 0 || BigInt(result.actualCostMicros) > usage.reservedMicros || !Number.isSafeInteger(result.inputTokens) || !Number.isSafeInteger(result.outputTokens) || result.inputTokens < 0 || result.outputTokens < 0 || !result.model)) throw new ForbiddenException('Invalid model usage');
      const updated = await tx.modelUsage.updateMany({ where: { id, organizationId, status: 'RESERVED' }, data: {
        status: result ? 'SETTLED' : 'RELEASED', actualMicros: result ? BigInt(result.actualCostMicros) : null,
        model: result?.model, inputTokens: result?.inputTokens, outputTokens: result?.outputTokens, completedAt: new Date()
      } });
      if (updated.count !== 1) throw new ConflictException('Model usage was concurrently settled');
      await tx.modelBudget.update({ where: { organizationId }, data: {
        reservedMicros: { decrement: usage.reservedMicros },
        ...(result ? { spentMicros: { increment: BigInt(result.actualCostMicros) } } : {})
      } });
      return { id, status: result ? 'SETTLED' : 'RELEASED', replay: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async summary(organizationId: string) {
    const budget = await this.db.modelBudget.findUnique({ where: { organizationId } });
    if (!budget) return { enabled: false };
    return { enabled: true, limitMicros: budget.limitMicros.toString(), spentMicros: budget.spentMicros.toString(), reservedMicros: budget.reservedMicros.toString() };
  }
}
