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
        await transport.publish({eventId:claimed.eventId,organizationId:claimed.organizationId,eventType:claimed.eventType,aggregateType:claimed.aggregateType,aggregateId:claimed.aggregateId,version:claimed.version,payload:claimed.payload,correlationId:claimed.correlationId,...(claimed.causationId ? {causationId:claimed.causationId} : {})});
        const result = await this.db.outboxEvent.updateMany({ where: { id: claimed.id, publishedAt: null, publishingAt: claimed.publishingAt }, data: { publishedAt: new Date(), publishingAt: null, lastError: null } });
        if (result.count === 1) published += 1;
      } catch (error) {
        await this.db.outboxEvent.updateMany({ where: { id: claimed.id, publishedAt: null, publishingAt: claimed.publishingAt }, data: { publishingAt: null, lastError: error instanceof Error ? error.message : 'Unknown publish error' } });
        failed += 1;
      }
    }
    return { published, failed };
  }

  private async claimOne() {
    const leaseCutoff = new Date(Date.now() - 5 * 60 * 1000);
    return this.db.$transaction(async tx => {
      const event = await tx.outboxEvent.findFirst({ where: { publishedAt: null, OR: [{ publishingAt: null }, { publishingAt: { lt: leaseCutoff } }] }, orderBy: { occurredAt: 'asc' } });
      if (!event) return null;
      const claimedAt = new Date();
      const result = await tx.outboxEvent.updateMany({ where: { id: event.id, publishedAt: null, OR: [{ publishingAt: null }, { publishingAt: { lt: leaseCutoff } }] }, data: { publishingAt: claimedAt, attempts: { increment: 1 } } });
      if (result.count !== 1) return null;
      return { ...event, publishingAt: claimedAt };
    });
  }
}
