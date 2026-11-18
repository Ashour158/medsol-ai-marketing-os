import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

export type BillingEvidence = {
  organizationId: string; usageId: string; providerRequestId: string;
  evidenceReference: string; actualCostMicros: number; model: string;
  inputTokens: number; outputTokens: number;
};
@Injectable()
export class ModelReconciliationService {
  constructor(private readonly db: PrismaService) {}
  async reconcile(evidence: BillingEvidence) {
    if (!evidence.organizationId || !evidence.usageId || !evidence.providerRequestId || !evidence.evidenceReference ||
      !Number.isSafeInteger(evidence.actualCostMicros) || evidence.actualCostMicros < 0 ||
      !Number.isSafeInteger(evidence.inputTokens) || evidence.inputTokens < 0 ||
      !Number.isSafeInteger(evidence.outputTokens) || evidence.outputTokens < 0 || !evidence.model) {
      throw new ForbiddenException('Verified billing evidence is required');
    }
    // Internal service only: caller must independently authenticate the provider billing record.
    // No public endpoint or unverified agent-provided billing evidence is accepted.
    return this.db.$transaction(async tx => {
      const usage = await tx.modelUsage.findFirst({ where: { id: evidence.usageId, organizationId: evidence.organizationId } });
      if (!usage) throw new ForbiddenException('Usage not found in tenant');
      if (usage.status !== 'RESERVED') return { id: usage.id, status: usage.status, replay: true };
      if (BigInt(evidence.actualCostMicros) > usage.reservedMicros) throw new ConflictException('Actual provider charge exceeds reserved budget; requires finance escalation');
      const changed = await tx.modelUsage.updateMany({
        where: { id: usage.id, organizationId: evidence.organizationId, status: 'RESERVED' },
        data: { status: 'SETTLED', actualMicros: BigInt(evidence.actualCostMicros), model: evidence.model,
          inputTokens: evidence.inputTokens, outputTokens: evidence.outputTokens, completedAt: new Date() }
      });
      if (changed.count !== 1) throw new ConflictException('Usage already reconciled');
      await tx.modelBudget.update({ where: { organizationId: evidence.organizationId }, data: {
        reservedMicros: { decrement: usage.reservedMicros }, spentMicros: { increment: BigInt(evidence.actualCostMicros) }
      } });
      return { id: usage.id, status: 'SETTLED', replay: false, evidenceReference: evidence.evidenceReference };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
