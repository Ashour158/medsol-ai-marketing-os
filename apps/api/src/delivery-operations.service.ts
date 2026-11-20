import { Injectable } from '@nestjs/common';
import { PrismaService,withMarketingTenant } from './prisma.service.js';

@Injectable()
export class DeliveryOperationsService {
  constructor(private readonly db: PrismaService) {}
  async summary(organizationId: string) {
    const now = new Date();
    return withMarketingTenant(this.db,organizationId,async tx=>{
    const [pending, retrying, deadLetters, oldestDeadLetters] = await Promise.all([
      tx.outboxEvent.count({ where: { organizationId, publishedAt: null, deadLetteredAt: null } }),
      tx.outboxEvent.count({ where: { organizationId, publishedAt: null, deadLetteredAt: null, attempts: { gt: 0 } } }),
      tx.outboxEvent.count({ where: { organizationId, deadLetteredAt: { not: null } } }),
      tx.outboxEvent.findMany({
        where: { organizationId, deadLetteredAt: { not: null } },
        orderBy: { deadLetteredAt: 'asc' }, take: 25,
        select: { id: true, eventId: true, eventType: true, attempts: true, lastError: true, deadLetteredAt: true }
      })
    ]);
    return { asOf: now.toISOString(), pending, retrying, deadLetters, oldestDeadLetters };
    });
  }
}
