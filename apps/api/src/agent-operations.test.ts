import { describe, expect, it, vi } from 'vitest';
import { MarketingReadService } from './marketing-read.service.js';
import { permissionForMarketingRoute, hasMarketingPermission } from './marketing-permissions.js';

function setup() {
  const db: any = { agentExecution: {
    count: vi.fn().mockResolvedValue(3),
    groupBy: vi.fn().mockResolvedValue([{ status: 'COMPLETED', _count: { _all: 2 } }, { status: 'BLOCKED', _count: { _all: 1 } }]),
    findMany: vi.fn().mockResolvedValue([{ id: 'e1', agentId: 'MKT-CMO-001', status: 'COMPLETED' }]),
    findFirst: vi.fn().mockResolvedValue({ id: 'e1', organizationId: 'tenant-a', status: 'COMPLETED' })
  } };
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$transaction=vi.fn(async(fn:any)=>fn(db));
  return { db, service: new MarketingReadService(db) };
}
describe('agent operations tenant boundary', () => {
  it('aggregates only tenant-owned executions', async () => {
    const { db, service } = setup();
    await expect(service.agentOperations('tenant-a')).resolves.toMatchObject({ total: 3, byStatus: { COMPLETED: 2, BLOCKED: 1 } });
    expect(db.agentExecution.count).toHaveBeenCalledWith({ where: { organizationId: 'tenant-a' } });
    expect(db.agentExecution.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'tenant-a' } }));
    expect(db.agentExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'tenant-a' }, take: 30 }));
  });
  it('does not disclose another tenant execution', async () => {
    const { db, service } = setup();
    db.agentExecution.findFirst.mockResolvedValueOnce(null);
    await expect(service.agentExecution('tenant-b', 'e1')).rejects.toThrow('not found in tenant');
    expect(db.agentExecution.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'tenant-b', id: 'e1' } }));
  });
  it('requires audit permission to read detailed agent traces', () => {
    const operations = permissionForMarketingRoute('GET','/marketing/agents/operations');
    const detail = permissionForMarketingRoute('GET','/marketing/agents/executions/e1');
    expect(operations).toBe('READ_AUDIT');
    expect(detail).toBe('READ_AUDIT');
    expect(hasMarketingPermission({ role: 'VIEWER' } as any, detail!)).toBe(false);
    expect(hasMarketingPermission({ role: 'CMO' } as any, detail!)).toBe(true);
    expect(() => permissionForMarketingRoute('POST','/marketing/agents/executions/e1')).toThrow();
  });
});
