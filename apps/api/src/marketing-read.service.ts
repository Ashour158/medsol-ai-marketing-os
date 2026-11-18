import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class MarketingReadService {
  constructor(private readonly db: PrismaService) {}
  /** Trusted tenant-scoped catalogue lookup used by the Brain; not regulatory verification. */
  async brainAuthorityContext(organizationId: string, input: {productId?:unknown;objectiveId?:unknown}) {
    const productId=input.productId;
    const objectiveId=input.objectiveId;
    if((productId!==undefined&&typeof productId!=='string')||
       (objectiveId!==undefined&&typeof objectiveId!=='string'))throw new BadRequestException('Invalid authority reference');
    const [product,objective]=await Promise.all([
      productId?this.db.marketingProduct.findFirst({
       where:{id:productId,organizationId,lifecycle:'ACTIVE'},
       select:{id:true,code:true,name:true,vendor:true,lifecycle:true}
      }):Promise.resolve(null),
      objectiveId?this.db.marketingObjective.findFirst({
       where:{id:objectiveId,organizationId,status:'ACTIVE'},
       select:{id:true,name:true,description:true,status:true}
      }):Promise.resolve(null)
    ]);
    if(productId&&!product)throw new NotFoundException('Active product not found in tenant catalogue');
    if(objectiveId&&!objective)throw new NotFoundException('Active objective not found in tenant catalogue');
    return {source:'TENANT_MARKETING_CATALOG',product,objective,
      declarationsVerified:true,scientificClaimsVerified:false,regulatoryApprovalVerified:false};
  }
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
      select: { id: true, code: true, name: true, status: true, riskLevel: true, version: true, objectiveId: true, productId: true, brandId: true, updatedAt: true } });
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
  async agentExecution(organizationId: string, id: string) {
    const item = await this.db.agentExecution.findFirst({
      where: { organizationId, id },
      select: { id: true, organizationId: true, agentId: true, correlationId: true, causationId: true, status: true, decision: true, startedAt: true, completedAt: true }
    });
    if (!item) throw new NotFoundException('Agent execution not found in tenant');
    return item;
  }
  async agentOperations(organizationId: string) {
    const [total, grouped, recent] = await Promise.all([
      this.db.agentExecution.count({ where: { organizationId } }),
      this.db.agentExecution.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
      this.db.agentExecution.findMany({
        where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 30,
        select: { id: true, agentId: true, status: true, correlationId: true, startedAt: true, completedAt: true }
      })
    ]);
    return { total, byStatus: Object.fromEntries(grouped.map(g => [g.status, g._count._all])), recent };
  }
  agentExecutions(organizationId: string) {
    return this.db.agentExecution.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, agentId: true, status: true, correlationId: true, startedAt: true, completedAt: true } });
  }
}
