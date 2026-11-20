import { describe, expect, it, vi } from 'vitest';
import { ModelReconciliationService } from './model-reconciliation.service.js';
const evidence = { organizationId: 'tenant', usageId: 'usage', providerRequestId: 'provider-1', evidenceReference: 'invoice-1', actualCostMicros: 600, model: 'approved-model', inputTokens: 100, outputTokens: 20 };
function fixture() {
  const db: any = { $queryRaw:vi.fn().mockResolvedValue([]), modelUsage: {
    findFirst: vi.fn().mockResolvedValue({ id: 'usage', organizationId: 'tenant', status: 'RESERVED', reservedMicros: 1000n }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 })
  }, modelBudget: { update: vi.fn().mockResolvedValue({}) } };
  db.$transaction = vi.fn(async (fn: (tx: any) => Promise<any>) => fn(db));
  return { db, service: new ModelReconciliationService(db) };
}
describe('provider billing reconciliation', () => {
  it('T14-001 records provider evidence and settles only tenant-owned usage', async () => {
    const { db, service } = fixture();
    await expect(service.reconcile(evidence)).resolves.toMatchObject({ status: 'SETTLED', evidenceReference: 'invoice-1' });
    expect(db.modelUsage.findFirst).toHaveBeenCalledWith({ where: { id: 'usage', organizationId: 'tenant' } });
    expect(db.modelUsage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ providerRequestId: 'provider-1', evidenceReference: 'invoice-1' }) }));
    expect(db.modelBudget.update).toHaveBeenCalledWith({ where: { organizationId: 'tenant' }, data: { reservedMicros: { decrement: 1000n }, spentMicros: { increment: 600n } } });
  });
  it('refuses settlement above reservation and prevents budget mutation', async () => {
    const { db, service } = fixture();
    await expect(service.reconcile({ ...evidence, actualCostMicros: 1200 })).rejects.toThrow('exceeds reserved');
    expect(db.modelBudget.update).not.toHaveBeenCalled();
  });
  it('does not settle a foreign tenant record', async () => {
    const { db, service } = fixture(); db.modelUsage.findFirst.mockResolvedValue(null);
    await expect(service.reconcile({ ...evidence, organizationId: 'other' })).rejects.toThrow('not found in tenant');
  });
  it('is idempotent after settlement', async () => {
    const { db, service } = fixture(); db.modelUsage.findFirst.mockResolvedValue({ id: 'usage', status: 'SETTLED', reservedMicros: 1000n });
    await expect(service.reconcile(evidence)).resolves.toMatchObject({ replay: true });
    expect(db.modelBudget.update).not.toHaveBeenCalled();
  });
});
