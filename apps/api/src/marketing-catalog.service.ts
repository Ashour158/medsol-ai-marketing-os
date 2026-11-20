import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService,withMarketingTenant } from './prisma.service.js';

@Injectable()
export class MarketingCatalogService {
  constructor(private readonly db: PrismaService) {}
  async createObjective(organizationId: string, actor: { userId: string; role: string } | undefined, input: { name: string; description: string }) {
    if (!actor || !['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR', 'CMO'].includes(actor.role.toUpperCase()))
      throw new ForbiddenException('Verified marketing manager role required to create objectives');
    const name = input.name?.trim(), description = input.description?.trim();
    if (!name || name.length < 3 || name.length > 160 || !description || description.length > 4000)
      throw new BadRequestException('Objective name (3–160) and description (1–4000) required');
    return withMarketingTenant(this.db,organizationId,async tx => {
      const objective = await tx.marketingObjective.create({ data: { organizationId, name, description } });
      await tx.auditEvent.create({ data: { organizationId, actorType: 'HUMAN', actorId: actor.userId, action: 'MARKETING_OBJECTIVE_CREATED', objectType: 'MarketingObjective', objectId: objective.id, after: { name, description }, correlationId: objective.id } });
      return { id: objective.id, name: objective.name, status: objective.status };
    });
  }
}
