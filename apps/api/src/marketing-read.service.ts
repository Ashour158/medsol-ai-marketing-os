import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class MarketingReadService {
  constructor(private readonly db: PrismaService) {}
  async overview(organizationId: string) {
    const [campaigns, objectives, products, workflows, pendingApprovals, recentAgents] = await Promise.all([
      this.db.campaign.count({ where: { organizationId } }),
      this.db.marketingObjective.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.db.marketingProduct.count({ where: { organizationId, lifecycle: 'ACTIVE' } }),
      this.db.workflowExecution.count({ where: { organizationId, status: 'RUNNING' } }),
      this.db.approval.count({ where: { organizationId, decision: 'PENDING' } }),
      this.db.agentExecution.count({ where: { organizationId, status: 'FAILED' } })
    ]);
    return { campaigns, activeObjectives: objectives, activeProducts: products, runningWorkflows: workflows, pendingApprovals, failedAgentExecutions: recentAgents };
  }
  campaigns(organizationId: string) {
    return this.db.campaign.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, code: true, name: true, status: true, riskLevel: true, version: true, objectiveId: true, productId: true, updatedAt: true } });
  }
  async campaign(organizationId: string, id: string) {
    const item = await this.db.campaign.findFirst({ where: { organizationId, id },
      include: { objective: { select: { id: true, name: true } }, product: { select: { id: true, name: true, code: true } } } });
    if (!item) throw new NotFoundException('Campaign not found in tenant');
    const [approvals, history] = await Promise.all([
      this.db.approval.findMany({ where: { organizationId, objectType: 'Campaign', objectId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.db.auditEvent.findMany({ where: { organizationId, objectType: 'Campaign', objectId: id }, orderBy: { occurredAt: 'desc' }, take: 50 })
    ]);
    return { ...item, approvals, history };
  }
  objectives(organizationId: string) {
    return this.db.marketingObjective.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, name: true, description: true, status: true, updatedAt: true } });
  }
  products(organizationId: string) {
    return this.db.marketingProduct.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, code: true, name: true, vendor: true, lifecycle: true } });
  }
  workflows(organizationId: string) {
    return this.db.workflowExecution.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, status: true, currentStep: true, correlationId: true, startedAt: true, updatedAt: true } });
  }
  agentExecutions(organizationId: string) {
    return this.db.agentExecution.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, agentId: true, status: true, correlationId: true, startedAt: true, completedAt: true } });
  }
}
