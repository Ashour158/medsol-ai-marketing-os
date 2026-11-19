import { describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CampaignService } from './campaign.service.js';
import { ApprovalService } from './approval.service.js';
import { OutboxService } from './outbox.service.js';

const enabled = process.env.MARKETING_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL campaign authority and approval integration', () => {
  it('T03-021 persists campaign, outbox, independent approval and tenant isolation atomically', async () => {
    const db = new PrismaClient();
    const orgId = 'integration-' + randomUUID();
    const otherId = 'integration-' + randomUUID();
    try {
      await db.$connect();
      await db.organization.createMany({ data: [{ id: orgId, name: 'Test organization' }, { id: otherId, name: 'Other tenant' }] });
      const author = await db.user.create({ data: { organizationId: orgId, email: 'author-' + randomUUID() + '@example.com', name: 'Author', role: 'CMO' } });
      const reviewer = await db.user.create({ data: { organizationId: orgId, email: 'reviewer-' + randomUUID() + '@example.com', name: 'Reviewer', role: 'CMO' } });
      const objective = await db.marketingObjective.create({ data: { organizationId: orgId, name: 'Genomics campaign', description: 'Testing governance' } });
      const campaigns = new CampaignService(db as any, new OutboxService(db as any));
      const created = await campaigns.create({ commandId: randomUUID(), correlationId: randomUUID(), organizationId: orgId, objectiveId: objective.id, code: 'TEST_' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(), name: 'Genomics awareness', riskLevel: 'R2' }, author.id) as { campaignId: string };
      expect(await db.campaign.count({ where: { id: created.campaignId, organizationId: otherId } })).toBe(0);
      expect(await db.outboxEvent.count({ where: { organizationId: orgId, aggregateId: created.campaignId } })).toBe(1);
      let version = 1;
      for (const to of ['ASSESSMENT', 'PROPOSED', 'APPROVAL_PENDING'] as const) {
        const result = await campaigns.transition({ commandId: randomUUID(), correlationId: randomUUID(), organizationId: orgId, campaignId: created.campaignId, to, expectedVersion: version }, author.id) as { version: number };
        version = result.version;
      }
      const pending = await db.approval.findFirstOrThrow({ where: { organizationId: orgId, objectId: created.campaignId, decision: 'PENDING' } });
      const workflows: any = { completeAfterApproval: async () => {}, blockAfterApprovalRejection: async () => {} };
      const approvals = new ApprovalService(db as any, workflows);
      const cmd = { commandId: randomUUID(), correlationId: randomUUID(), organizationId: orgId, approvalId: pending.id, approverUserId: author.id, decision: 'APPROVED' as const, rationale: 'Review' };
      await expect(approvals.approve(cmd)).rejects.toThrow('cannot approve');
      expect((await db.approval.findUniqueOrThrow({ where: { id: pending.id } })).decision).toBe('PENDING');
      await expect(approvals.approve({ ...cmd, commandId: randomUUID(), organizationId: otherId, approverUserId: reviewer.id })).rejects.toThrow('Approval not found in tenant');
      const acceptedCommand = { ...cmd, commandId: randomUUID(), approverUserId: reviewer.id };
      const decision = await approvals.approve(acceptedCommand);
      expect(decision).toMatchObject({ decision: 'APPROVED' });
      expect(await approvals.approve(acceptedCommand)).toEqual(decision);
      await expect(approvals.approve({ ...acceptedCommand, commandId: randomUUID(), decision: 'REJECTED' })).rejects.toThrow('already decided');
      expect((await db.campaign.findUniqueOrThrow({ where: { id: created.campaignId } })).status).toBe('APPROVED');
      expect(await db.auditEvent.count({ where: { organizationId: orgId, objectId: created.campaignId, action: 'CAMPAIGN_APPROVED' } })).toBe(1);
    } finally {
      // Restrict cleanup to isolated test tenants; never run this test on production.
      await db.auditEvent.deleteMany({ where: { organizationId: orgId } });
      await db.outboxEvent.deleteMany({ where: { organizationId: orgId } });
      await db.commandReceipt.deleteMany({ where: { organizationId: orgId } });
      await db.approval.deleteMany({ where: { organizationId: orgId } });
      await db.campaign.deleteMany({ where: { organizationId: orgId } });
      await db.marketingObjective.deleteMany({ where: { organizationId: orgId } });
      await db.user.deleteMany({ where: { organizationId: orgId } });
      await db.organization.deleteMany({ where: { id: { in: [orgId, otherId] } } });
      await db.$disconnect();
    }
  }, 30000);
});
