import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CampaignService } from './campaign.service.js';

const command = {
  commandId: 'cmd-1',
  correlationId: 'corr-1',
  organizationId: 'tenant-a',
  campaignId: 'campaign-1',
  to: 'APPROVED' as const,
  expectedVersion: 4
};

function fixture(status: string, version = 4) {
  const campaign = { id: 'campaign-1', organizationId: 'tenant-a', status, version, riskLevel: 'R2' };
  const tx = {
    $queryRaw:vi.fn().mockResolvedValue([]),
    campaign: {
      findFirst: vi.fn().mockResolvedValue(campaign),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...campaign, status: 'PROPOSED', version: version + 1 })
    },
    approval: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    commandReceipt: { findUnique:vi.fn().mockResolvedValue(null),create: vi.fn() },
    auditEvent: { create: vi.fn() }
  };
  const db = {
    commandReceipt: tx.commandReceipt,
    $transaction: async (fn: (transaction: any) => Promise<unknown>) => fn(tx)
  };
  const outbox = { enqueue: vi.fn() };
  const service = new CampaignService(db as any, outbox as any);
  return { service, tx, db, outbox };
}

describe('campaign authority and concurrency', () => {
  it('refuses direct APPROVED transitions even from the previous legal state', async () => {
    const { service, tx } = fixture('APPROVAL_PENDING');
    await expect(service.transition(command)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale authoritative versions before mutation', async () => {
    const { service, tx } = fixture('ASSESSMENT', 5);
    await expect(service.transition({ ...command, to: 'PROPOSED' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects competing writes that lose the version compare-and-swap', async () => {
    const { service, tx } = fixture('ASSESSMENT');
    tx.campaign.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.transition({ ...command, to: 'PROPOSED' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays a command receipt without mutating campaign state', async () => {
    const { service, db, tx } = fixture('ASSESSMENT');
    db.commandReceipt.findUnique.mockResolvedValue({ response: { campaignId: 'campaign-1', status: 'PROPOSED', version: 5 } });
    await expect(service.transition({ ...command, to: 'PROPOSED' })).resolves.toEqual({ campaignId: 'campaign-1', status: 'PROPOSED', version: 5 });
    expect(tx.campaign.findFirst).not.toHaveBeenCalled();
  });

  it('prevents cross-tenant campaign access', async () => {
    const { service, tx } = fixture('ASSESSMENT');
    tx.campaign.findFirst.mockResolvedValue(null);
    await expect(service.transition({ ...command, to: 'PROPOSED' })).rejects.toThrow('Campaign not found in tenant');
    expect(tx.campaign.findFirst).toHaveBeenCalledWith({ where: { id: 'campaign-1', organizationId: 'tenant-a' } });
  });
});
