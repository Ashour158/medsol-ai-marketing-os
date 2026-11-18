import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

export type PublishedEvent = {
  eventId: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
  payload: unknown;
  correlationId: string;
  causationId?: string;
};

export interface EventTransport {
  publish(event: PublishedEvent): Promise<void>;
}

@Injectable()
export class OutboxPublisherService {
  constructor(private readonly db: PrismaService) {}

  async publishBatch(transport: EventTransport, limit = 50): Promise<{ published: number; failed: number }> {
    let published = 0;
    let failed = 0;
    for (let i = 0; i < limit; i += 1) {
      const claimed = await this.claimOne();
      if (!claimed) break;
      try {
        await transport.publish(claimed);
        await this.db.outboxEvent.update({ where: { id: claimed.id }, data: { publishedAt: new Date(), publishingAt: null, lastError: null } });
        published += 1;
      } catch (error) {
        await this.db.outboxEvent.update({ where: { id: claimed.id }, data: { publishingAt: null, lastError: error instanceof Error ? error.message : 'Unknown publish error' } });
        failed += 1;
      }
    }
    return { published, failed };
  }

  private async claimOne() {
    return this.db.$transaction(async tx => {
      const event = await tx.outboxEvent.findFirst({ where: { publishedAt: null, publishingAt: null }, orderBy: { occurredAt: 'asc' } });
      if (!event) return null;
      const claimedAt = new Date();
      const result = await tx.outboxEvent.updateMany({ where: { id: event.id, publishedAt: null, publishingAt: null }, data: { publishingAt: claimedAt, attempts: { increment: 1 } } });
      if (result.count !== 1) return null;
      return { ...event, publishingAt: claimedAt };
    });
  }
}
