import { describe, expect, it, vi } from 'vitest';
import { MarketingReadService } from './marketing-read.service.js';

function fixture() {
  const db: any = {
    campaign: { count: vi.fn().mockResolvedValue(4), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    marketingObjective: { count: vi.fn().mockResolvedValue(2), findMany: vi.fn().mockResolvedValue([]) },
    marketingProduct: { count: vi.fn().mockResolvedValue(3), findMany: vi.fn().mockResolvedValue([]) },
    workflowExecution: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([]) },
    approval: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([]) },
    agentExecution: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) }
  };
  return { db, service: new MarketingReadService(db) };
}
describe('marketing read model isolation', () => {
  it('always filters portfolio by the authenticated organization', async () => {
    const { db, service } = fixture();
    await service.campaigns('org-a');
    expect(db.campaign.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a' }, take: 100 }));
  });
  it('filters operational KPIs by organization', async () => {
    const { db, service } = fixture();
    expect(await service.overview('org-a')).toEqual({ campaigns: 4, activeObjectives: 2, activeProducts: 3, runningWorkflows: 1, pendingApprovals: 1, failedAgentExecutions: 0 });
    expect(db.approval.count).toHaveBeenCalledWith({ where: { organizationId: 'org-a', decision: 'PENDING' } });
  });
  it('does not reveal a campaign belonging to another tenant', async () => {
    const { db, service } = fixture();
    await expect(service.campaign('org-a', 'other-campaign')).rejects.toThrow('Campaign not found in tenant');
    expect(db.campaign.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a', id: 'other-campaign' } }));
  });
  it('limits agent history and workflow results to tenant', async () => {
    const { db, service } = fixture();
    await service.agentExecutions('org-a');
    await service.workflows('org-a');
    expect(db.agentExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a' }, take: 100 }));
    expect(db.workflowExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a' }, take: 100 }));
  });
});
