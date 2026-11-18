import { describe, expect, it, vi } from 'vitest';
import { MarketingCatalogService } from './marketing-catalog.service.js';

function fixture() {
  const tx: any = { marketingObjective: { create: vi.fn().mockResolvedValue({ id: 'obj-1', name: 'Genomics', status: 'ACTIVE' }) }, auditEvent: { create: vi.fn() } };
  const db: any = { $transaction: vi.fn(async (fn: (t: any) => Promise<unknown>) => fn(tx)) };
  return { tx, service: new MarketingCatalogService(db) };
}
describe('objective authority', () => {
  it('denies bootstrap or anonymous objective creation', async () => {
    const { service, tx } = fixture();
    await expect(service.createObjective('tenant', undefined, { name: 'Genomics', description: 'Launch' })).rejects.toThrow('Verified marketing manager');
    expect(tx.marketingObjective.create).not.toHaveBeenCalled();
  });
  it('denies unprivileged users', async () => {
    const { service } = fixture();
    await expect(service.createObjective('tenant', { userId: 'u', role: 'USER' }, { name: 'Genomics', description: 'Launch' })).rejects.toThrow('Verified marketing manager');
  });
  it('writes objective and audit within same transaction', async () => {
    const { service, tx } = fixture();
    await service.createObjective('tenant', { userId: 'u', role: 'CMO' }, { name: ' Genomics ', description: ' Launch ' });
    expect(tx.marketingObjective.create).toHaveBeenCalledWith({ data: { organizationId: 'tenant', name: 'Genomics', description: 'Launch' } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: 'u', organizationId: 'tenant' }) }));
  });
});
