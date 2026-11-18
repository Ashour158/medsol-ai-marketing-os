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
        data: { status: 'SETTLED', actualMicros: BigInt(evidence.actualCostMicros),
          billingStatus:'VERIFIED',verifiedBilledMicros:BigInt(evidence.actualCostMicros),
          billedEvidenceReference:evidence.evidenceReference,billedVerifiedAt:new Date(), model: evidence.model,
          providerRequestId: evidence.providerRequestId, evidenceReference: evidence.evidenceReference,
          inputTokens: evidence.inputTokens, outputTokens: evidence.outputTokens, completedAt: new Date() }
      });
      if (changed.count !== 1) throw new ConflictException('Usage already reconciled');
      await tx.modelBudget.update({ where: { organizationId: evidence.organizationId }, data: {
        reservedMicros: { decrement: usage.reservedMicros }, spentMicros: { increment: BigInt(evidence.actualCostMicros) }
      } });
      return { id: usage.id, status: 'SETTLED', replay: false, evidenceReference: evidence.evidenceReference };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  /**
   * Attach independently authenticated invoice evidence to a settled estimate.
   * No client-facing API exists: an authorised billing integration must authenticate
   * provider records before calling this service. We preserve policy spending estimates;
   * any provider overage is surfaced for finance instead of silently changing budgets.
   */
  async verifySettledInvoice(evidence: BillingEvidence) {
    if (!evidence.organizationId || !evidence.usageId || !evidence.providerRequestId ||
        !evidence.evidenceReference || evidence.evidenceReference.length > 500 ||
        !Number.isSafeInteger(evidence.actualCostMicros) || evidence.actualCostMicros < 0 ||
        !Number.isSafeInteger(evidence.inputTokens) || evidence.inputTokens < 0 ||
        !Number.isSafeInteger(evidence.outputTokens) || evidence.outputTokens < 0 ||
        !evidence.model) throw new ForbiddenException('Authenticated provider invoice evidence required');
    return this.db.$transaction(async tx => {
      const usage = await tx.modelUsage.findFirst({where:{id:evidence.usageId,organizationId:evidence.organizationId}});
      if (!usage) throw new ForbiddenException('Model usage not found in tenant');
      if (usage.status !== 'SETTLED') throw new ConflictException('Only settled estimates can be invoice verified');
      if (usage.billingStatus === 'VERIFIED') {
        if (usage.billedEvidenceReference !== evidence.evidenceReference ||
            usage.verifiedBilledMicros !== BigInt(evidence.actualCostMicros) ||
            usage.providerRequestId !== evidence.providerRequestId)
          throw new ConflictException('Conflicting invoice for already verified usage');
        return {id:usage.id,replay:true,billingStatus:'VERIFIED'};
      }
      if (usage.model !== evidence.model) throw new ConflictException('Invoice model does not match recorded usage');
      if (usage.providerRequestId && usage.providerRequestId !== evidence.providerRequestId)
        throw new ConflictException('Provider request reference mismatch');
      const billed=BigInt(evidence.actualCostMicros);
      const estimated=usage.actualMicros??0n;
      const changed=await tx.modelUsage.updateMany({
        where:{id:usage.id,organizationId:evidence.organizationId,status:'SETTLED',billingStatus:{not:'VERIFIED'}},
        data:{billingStatus:'VERIFIED',verifiedBilledMicros:billed,billedEvidenceReference:evidence.evidenceReference,
          billedVerifiedAt:new Date(),providerRequestId:evidence.providerRequestId,evidenceReference:evidence.evidenceReference}
      });
      if(changed.count!==1)throw new ConflictException('Concurrent invoice verification');
      await tx.auditEvent.create({data:{
        organizationId:evidence.organizationId,actorType:'SYSTEM',actorId:'provider-billing-reconciliation',
        action:'MODEL_INVOICE_VERIFIED',objectType:'ModelUsage',objectId:usage.id,
        correlationId:usage.requestId,
        after:{evidenceReference:evidence.evidenceReference,
          estimatedMicros:estimated.toString(),verifiedBilledMicros:billed.toString(),
          excessOverEstimateMicros:(billed>estimated?billed-estimated:0n).toString()}
      }});
      return {id:usage.id,replay:false,billingStatus:'VERIFIED',
        verifiedBilledMicros:billed.toString(),estimatedMicros:estimated.toString(),
        financeReviewRequired:billed>estimated};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

}
