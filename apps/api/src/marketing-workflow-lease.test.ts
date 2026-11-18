import { describe, expect, it, vi } from 'vitest';
import { MarketingWorkflowService } from './marketing-workflow.service.js';

const request: any = { organizationId: 'tenant', requestedOutcome: 'Launch', targetAudience: 'Researchers' };
function fixture() {
  const lease = { workflowId: 'wf', organizationId: 'tenant', owner: 'worker', generation: 3, expiresAt: new Date(Date.now()+60000) };
  const leases: any = { claim: vi.fn().mockResolvedValue(lease), assertActive: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
  const db: any = { workflowExecution: {
    create: vi.fn().mockResolvedValue({ id: 'wf' }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'wf', status: 'COMPLETED', currentStep: 'OBJECTIVE_REQUIRED', correlationId: 'corr' })
  }, workflowStepExecution: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({data}: any) => ({ id: data.stepKey, ...data })),
    update: vi.fn().mockResolvedValue({})
  } };
  const agents: any = { execute: vi.fn().mockImplementation(async (id: string) => ({ executionId: id, decision: { payload: { status: 'draft' } } })) };
  const service = new MarketingWorkflowService(db, agents, {} as any, leases);
  return { service, leases, db, agents };
}
describe('fenced workflow integration', () => {
  it('claims and releases lease around workflow execution', async () => {
    const { service, leases, db } = fixture();
    await expect(service.start(request)).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(leases.claim).toHaveBeenCalledWith('tenant','wf',300000);
    expect(leases.assertActive).toHaveBeenCalled();
    expect(leases.release).toHaveBeenCalledOnce();
    expect(db.workflowExecution.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ leaseOwner: 'worker', leaseGeneration: 3 })
    }));
  });
  it('does not execute agents if the workflow lease is lost', async () => {
    const { service, leases, agents } = fixture();
    leases.assertActive.mockRejectedValue(new Error('stale fencing token'));
    await expect(service.start(request)).rejects.toThrow('stale fencing token');
    expect(agents.execute).not.toHaveBeenCalled();
    expect(leases.release).toHaveBeenCalledOnce();
  });
});
