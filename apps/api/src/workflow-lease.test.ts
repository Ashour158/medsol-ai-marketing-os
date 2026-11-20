import { describe, expect, it, vi } from 'vitest';
import { WorkflowLeaseService } from './workflow-lease.service.js';

function fixture() {
  const db: any = {
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue({ id: 'w', organizationId: 't', status: 'RUNNING', version: 4, leaseGeneration: 2, leaseExpiresAt: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    }
  };
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$transaction = vi.fn(async (callback: (tx: any) => Promise<any>) => callback(db));
  return { db, service: new WorkflowLeaseService(db) };
}
describe('workflow lease fencing', () => {
  it('claims a tenant-owned workflow with generation increment', async () => {
    const { db, service } = fixture();
    const lease = await service.claim('t', 'w');
    expect(lease).toMatchObject({ workflowId: 'w', organizationId: 't', generation: 3 });
    expect(db.workflowExecution.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'w', organizationId: 't', version: 4 }),
      data: expect.objectContaining({ leaseGeneration: { increment: 1 } })
    }));
  });
  it('rejects active leases and foreign tenant workflows', async () => {
    const { db, service } = fixture();
    db.workflowExecution.findFirst.mockResolvedValueOnce({ status: 'RUNNING', leaseExpiresAt: new Date(Date.now()+60000) });
    await expect(service.claim('t', 'w')).rejects.toThrow('active lease');
    db.workflowExecution.findFirst.mockResolvedValueOnce(null);
    await expect(service.claim('foreign', 'w')).rejects.toThrow('not found in tenant');
  });
  it('rejects stale fencing tokens on heartbeat', async () => {
    const { db, service } = fixture();
    db.workflowExecution.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.heartbeat({ workflowId: 'w', organizationId: 't', owner: 'old', generation: 1, expiresAt: new Date() })).rejects.toThrow('lost or expired');
  });
  it('rejects stale releases', async () => {
    const { db, service } = fixture();
    db.workflowExecution.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.release({ workflowId: 'w', organizationId: 't', owner: 'old', generation: 1, expiresAt: new Date() })).rejects.toThrow('superseded');
  });
});
