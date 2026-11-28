import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type ModelUsage } from '@prisma/client';
import { PrismaService, withMarketingTenant } from './prisma.service.js';

@Injectable()
export class ModelBudgetService {
  constructor(private readonly db: PrismaService) {}
  async reserve(input: { organizationId: string; requestId: string; agentId: string; costMicros: number }) {
    return withMarketingTenant(this.db,input.organizationId,tx=>this.reserveInTransaction(tx,input),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
  /** Shared canonical reservation. Caller owns an already tenant-scoped transaction. */
  async reserveInTransaction(tx:Prisma.TransactionClient,input:{organizationId:string;requestId:string;agentId:string;costMicros:number}) {
    const { organizationId, requestId, agentId, costMicros } = input;
    if (!organizationId || !requestId || !agentId || !Number.isSafeInteger(costMicros) || costMicros < 0 || costMicros > 100000000) throw new ForbiddenException('Invalid model reservation');
      // Serialize budget mutation with other canonical reserve/settle callers.
      await tx.$queryRaw`SELECT "organizationId" FROM "ModelBudget" WHERE "organizationId"=${organizationId} FOR UPDATE`;
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
  }
  async settle(organizationId: string, id: string, result: { actualCostMicros: number; model: string; inputTokens: number; outputTokens: number } | null) {
    return withMarketingTenant(this.db,organizationId,tx=>this.settleInTransaction(tx,organizationId,id,result),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
  /** Shared canonical settlement/release; no provider is called here. */
  async settleInTransaction(tx:Prisma.TransactionClient,organizationId:string,id:string,result:{actualCostMicros:number;model:string;inputTokens:number;outputTokens:number}|null){
      await tx.$queryRaw`SELECT "organizationId" FROM "ModelBudget" WHERE "organizationId"=${organizationId} FOR UPDATE`;
      const usage = await tx.modelUsage.findFirst({ where: { id, organizationId } });
      if (!usage) throw new ForbiddenException('Model reservation not found in tenant');
      if (usage.status !== 'RESERVED') return { id: usage.id, status: usage.status, replay: true };
      if (result && (!Number.isSafeInteger(result.actualCostMicros) || result.actualCostMicros < 0 || BigInt(result.actualCostMicros) > usage.reservedMicros || !Number.isSafeInteger(result.inputTokens) || !Number.isSafeInteger(result.outputTokens) || result.inputTokens < 0 || result.outputTokens < 0 || !result.model)) throw new ForbiddenException('Invalid model usage');
      const updated = await tx.modelUsage.updateMany({ where: { id, organizationId, status: 'RESERVED' }, data: {
        status: result ? 'SETTLED' : 'RELEASED', billingStatus: result ? 'ESTIMATED' : 'UNVERIFIED', actualMicros: result ? BigInt(result.actualCostMicros) : null,
        ...(result ? { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens } : {}), completedAt: new Date()
      } });
      if (updated.count !== 1) throw new ConflictException('Model usage was concurrently settled');
      await tx.modelBudget.update({ where: { organizationId }, data: {
        reservedMicros: { decrement: usage.reservedMicros },
        ...(result ? { spentMicros: { increment: BigInt(result.actualCostMicros) } } : {})
      } });
      return { id, status: result ? 'SETTLED' : 'RELEASED', replay: false };
  }
  async summary(organizationId: string) {
    return withMarketingTenant(this.db, organizationId, async tx => {
      const budget = await tx.modelBudget.findUnique({ where: { organizationId } });
      if (!budget) return { enabled: false as const };
      const [confirmed, awaitingConfirmation] = await Promise.all([
        tx.modelUsage.aggregate({where:{organizationId,billingStatus:'VERIFIED'},_sum:{verifiedBilledMicros:true},_count:{_all:true}}),
        tx.modelUsage.count({where:{organizationId,status:'SETTLED',billingStatus:{not:'VERIFIED'}}})
      ]);
      return { enabled: true as const,
        limitMicros: budget.limitMicros.toString(),
        spentMicros: budget.spentMicros.toString(),
        estimatedSpentMicros: budget.spentMicros.toString(),
        reservedMicros: budget.reservedMicros.toString(),
        verifiedBilledMicros:(confirmed._sum.verifiedBilledMicros??0n).toString(),
        verifiedInvoiceCount:confirmed._count._all,
        awaitingInvoiceCount:awaitingConfirmation,
        accountingStatus:'ESTIMATES_NOT_INVOICES',
        requiresExternalBillingReconciliation:awaitingConfirmation>0
      };
    });
  }
}
