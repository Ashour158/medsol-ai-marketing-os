import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketingWorkflowService } from './marketing-workflow.service.js';

function fixture(status: string, overrides: Record<string, unknown> = {}) {
  const workflow = {
    id: 'wf-1', organizationId: 'tenant-a', status, version: 2,
    currentStep: 'CAMPAIGN_CREATION', correlationId: 'corr-1',
    input: { organizationId: 'tenant-a', requestedOutcome: 'Generate demand' },
    output: null, ...overrides
  };
  const db = {
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue(workflow),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    }
  };
  const service = new MarketingWorkflowService(db as any, {} as any, {} as any, {} as any);
  return { service, db, workflow };
}

describe('workflow recovery authority', () => {
  it('rejects cross-tenant recovery', async () => {
    const { service, db } = fixture('FAILED');
    db.workflowExecution.findFirst.mockResolvedValue(null);
    await expect(service.resume('wf-1', 'tenant-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.workflowExecution.findFirst).toHaveBeenCalledWith({ where: { id: 'wf-1', organizationId: 'tenant-b' } });
  });

  it('does not restart a live workflow without a stale-execution lease', async () => {
    const { service, db } = fixture('RUNNING');
    await expect(service.resume('wf-1', 'tenant-a')).rejects.toBeInstanceOf(ConflictException);
    expect(db.workflowExecution.updateMany).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'BLOCKED', 'WAITING_APPROVAL', 'CANCELLED'])('replays terminal or waiting status %s without mutation', async status => {
    const { service, db } = fixture(status);
    await expect(service.resume('wf-1', 'tenant-a')).resolves.toMatchObject({ workflowExecutionId: 'wf-1', status });
    expect(db.workflowExecution.updateMany).not.toHaveBeenCalled();
  });

  it('prevents simultaneous failed-workflow recovery claims', async () => {
    const { service, db } = fixture('FAILED');
    db.workflowExecution.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.resume('wf-1', 'tenant-a')).rejects.toBeInstanceOf(ConflictException);
    expect(db.workflowExecution.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wf-1', organizationId: 'tenant-a', status: 'FAILED', version: 2 }
    }));
  });
});
