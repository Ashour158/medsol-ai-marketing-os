import { describe, expect, it, vi } from 'vitest';
import { BoundedModelGateway, DisabledModelAdapter } from '@medsol/agent-runtime';
import { ModelBudgetService } from './model-budget.service.js';

const request = { organizationId: 'tenant', correlationId: 'corr', agentId: 'MKT-CMO-001', purpose: 'Draft objective', input: 'Hello', maxOutputTokens: 10, timeoutMs: 100, estimatedCostMicros: 1000 };
describe('governed model gateway', () => {
  it('fails closed without a configured provider', async () => {
    await expect(new BoundedModelGateway(new DisabledModelAdapter()).complete(request)).rejects.toThrow('disabled');
  });
  it('validates structured token usage and cost bounds', async () => {
    const gateway = new BoundedModelGateway({ async complete() { return { text: 'ok', inputTokens: 5, outputTokens: 11, actualCostMicros: 20, model: 'test' }; } });
    await expect(gateway.complete(request)).rejects.toThrow('output token limit');
    const expensive = new BoundedModelGateway({ async complete() { return { text: 'ok', inputTokens: 5, outputTokens: 5, actualCostMicros: 2000, model: 'test' }; } });
    await expect(expensive.complete(request)).rejects.toThrow('reserved cost');
  });
  it('enforces timeouts and cancels the provider', async () => {
    let signal: AbortSignal | undefined;
    const gateway = new BoundedModelGateway({ complete(_r, s) { signal = s; return new Promise(() => {}); } });
    await expect(gateway.complete(request)).rejects.toThrow('timed out');
    expect(signal?.aborted).toBe(true);
  });
  it('accepts bounded validated output', async () => {
    const gateway = new BoundedModelGateway({ async complete() { return { text: 'draft', inputTokens: 5, outputTokens: 4, actualCostMicros: 500, model: 'test' }; } });
    await expect(gateway.complete(request)).resolves.toMatchObject({ text: 'draft', actualCostMicros: 500 });
  });
});
describe('model budget authority', () => {
  function fixture() {
    const db: any = {
      $queryRaw:vi.fn().mockResolvedValue([]),
      modelUsage: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'usage', status: 'RESERVED' }), findFirst: vi.fn().mockResolvedValue({ id: 'usage', organizationId: 'tenant', status: 'RESERVED', reservedMicros: 1000n }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      modelBudget: { findUnique: vi.fn().mockResolvedValue({ limitMicros: 10000n, spentMicros: 100n, reservedMicros: 200n }), update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => callback(db))
    };
    return { db, service: new ModelBudgetService(db) };
  }
  it('reserves only when the tenant has sufficient budget', async () => {
    const { db, service } = fixture();
    await expect(service.reserve({ organizationId: 'tenant', requestId: 'req', agentId: 'MKT-CMO-001', costMicros: 1000 })).resolves.toMatchObject({ id: 'usage', replay: false });
    expect(db.modelBudget.update).toHaveBeenCalledWith({ where: { organizationId: 'tenant' }, data: { reservedMicros: { increment: 1000n } } });
    db.modelBudget.findUnique.mockResolvedValue({ limitMicros: 1000n, spentMicros: 900n, reservedMicros: 200n });
    await expect(service.reserve({ organizationId: 'tenant', requestId: 'other', agentId: 'MKT-CMO-001', costMicros: 100 })).rejects.toThrow('budget exceeded');
  });
  it('does not double-reserve an idempotent request', async () => {
    const { db, service } = fixture();
    db.modelUsage.findUnique.mockResolvedValue({ id: 'existing', agentId: 'MKT-CMO-001', reservedMicros: 1000n, status: 'SETTLED' });
    await expect(service.reserve({ organizationId: 'tenant', requestId: 'req', agentId: 'MKT-CMO-001', costMicros: 1000 })).resolves.toMatchObject({ replay: true });
    expect(db.modelBudget.update).not.toHaveBeenCalled();
  });
  it('settles exactly once and releases unspent reservation', async () => {
    const { db, service } = fixture();
    await expect(service.settle('tenant', 'usage', { actualCostMicros: 600, model: 'test', inputTokens: 5, outputTokens: 4 })).resolves.toMatchObject({ status: 'SETTLED' });
    expect(db.modelBudget.update).toHaveBeenCalledWith({ where: { organizationId: 'tenant' }, data: { reservedMicros: { decrement: 1000n }, spentMicros: { increment: 600n } } });
    db.modelUsage.findFirst.mockResolvedValue({ id: 'usage', status: 'SETTLED', reservedMicros: 1000n });
    await expect(service.settle('tenant', 'usage', null)).resolves.toMatchObject({ replay: true });
  });
});
