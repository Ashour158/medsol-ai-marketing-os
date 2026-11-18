import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { randomUUID } from 'node:crypto';

export type WorkflowLease = { workflowId: string; organizationId: string; owner: string; generation: number; expiresAt: Date };
@Injectable()
export class WorkflowLeaseService {
  constructor(private readonly db: PrismaService) {}
  async claim(organizationId: string, workflowId: string, ttlMs = 30000): Promise<WorkflowLease> {
    if (!organizationId || !workflowId || !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new ForbiddenException('Invalid lease claim');
    const owner = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const result = await this.db.$transaction(async tx => {
      const workflow = await tx.workflowExecution.findFirst({ where: { id: workflowId, organizationId } });
      if (!workflow) throw new NotFoundException('Workflow not found in tenant');
      if (!['RUNNING','FAILED'].includes(workflow.status)) throw new ConflictException('Workflow is not executable');
      if (workflow.leaseExpiresAt && workflow.leaseExpiresAt > now) throw new ConflictException('Workflow has an active lease');
      const changed = await tx.workflowExecution.updateMany({
        where: { id: workflowId, organizationId, version: workflow.version,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
        data: { leaseOwner: owner, leaseExpiresAt: expiresAt, leaseGeneration: { increment: 1 }, version: { increment: 1 } }
      });
      if (changed.count !== 1) throw new ConflictException('Lease was claimed concurrently');
      return { generation: workflow.leaseGeneration + 1 };
    });
    return { workflowId, organizationId, owner, generation: result.generation, expiresAt };
  }
  async heartbeat(lease: WorkflowLease, ttlMs = 30000) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new ForbiddenException('Invalid lease extension');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const changed = await this.db.workflowExecution.updateMany({
      where: { id: lease.workflowId, organizationId: lease.organizationId, leaseOwner: lease.owner,
        leaseGeneration: lease.generation, leaseExpiresAt: { gt: now }, status: 'RUNNING' },
      data: { leaseExpiresAt: expiresAt }
    });
    if (changed.count !== 1) throw new ConflictException('Workflow lease lost or expired');
    return { ...lease, expiresAt };
  }
  async release(lease: WorkflowLease) {
    const changed = await this.db.workflowExecution.updateMany({
      where: { id: lease.workflowId, organizationId: lease.organizationId, leaseOwner: lease.owner, leaseGeneration: lease.generation },
      data: { leaseOwner: null, leaseExpiresAt: null }
    });
    if (changed.count !== 1) throw new ConflictException('Workflow lease was superseded');
  }
  async assertActive(lease: WorkflowLease) {
    const found = await this.db.workflowExecution.findFirst({
      where: { id: lease.workflowId, organizationId: lease.organizationId, leaseOwner: lease.owner,
        leaseGeneration: lease.generation, leaseExpiresAt: { gt: new Date() } },
      select: { id: true }
    });
    if (!found) throw new ConflictException('Workflow execution fencing token is stale');
  }
}
