import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class DeliveryOperationsService {
  constructor(private readonly db: PrismaService) {}
  async summary(organizationId: string) {
    const now = new Date();
    const [pending, retrying, deadLetters, oldestDeadLetters] = await Promise.all([
      this.db.outboxEvent.count({ where: { organizationId, publishedAt: null, deadLetteredAt: null } }),
      this.db.outboxEvent.count({ where: { organizationId, publishedAt: null, deadLetteredAt: null, attempts: { gt: 0 } } }),
      this.db.outboxEvent.count({ where: { organizationId, deadLetteredAt: { not: null } } }),
      this.db.outboxEvent.findMany({
        where: { organizationId, deadLetteredAt: { not: null } },
        orderBy: { deadLetteredAt: 'asc' }, take: 25,
        select: { id: true, eventId: true, eventType: true, attempts: true, lastError: true, deadLetteredAt: true }
      })
    ]);
    return { asOf: now.toISOString(), pending, retrying, deadLetters, oldestDeadLetters };
  }
}
