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

export const MAX_DELIVERY_ATTEMPTS = 8;
export function deliveryDelayMs(attempt: number): number { return Math.min(3600000, 1000 * 2 ** Math.min(Math.max(attempt - 1, 0), 12)); }

export interface EventTransport {
  publish(event: PublishedEvent): Promise<void>;
}

@Injectable()
export class OutboxPublisherService {
  constructor(private readonly db: PrismaService) {}

  async publishBatch(transport: EventTransport, limit = 50): Promise<{ published: number; failed: number }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid dispatch batch size');
    let published = 0;
    let failed = 0;
    for (let i = 0; i < limit; i += 1) {
      const claimed = await this.claimOne();
      if (!claimed) break;
      try {
        await transport.publish({eventId:claimed.eventId,organizationId:claimed.organizationId,eventType:claimed.eventType,aggregateType:claimed.aggregateType,aggregateId:claimed.aggregateId,version:claimed.version,payload:claimed.payload,correlationId:claimed.correlationId,...(claimed.causationId ? {causationId:claimed.causationId} : {})});
        const result = await this.db.outboxEvent.updateMany({ where: { id: claimed.id, publishedAt: null, deadLetteredAt: null, publishingAt: claimed.publishingAt }, data: { publishedAt: new Date(), publishingAt: null, nextAttemptAt: null, lastError: null } });
        if (result.count === 1) published += 1;
      } catch (error) {
        const dead = claimed.attempts + 1 >= MAX_DELIVERY_ATTEMPTS;
        const nextAttemptAt = dead ? null : new Date(Date.now() + deliveryDelayMs(claimed.attempts + 1));
        await this.db.outboxEvent.updateMany({
          where: { id: claimed.id, publishedAt: null, deadLetteredAt: null, publishingAt: claimed.publishingAt },
          data: { publishingAt: null, nextAttemptAt, ...(dead ? { deadLetteredAt: new Date() } : {}), lastError: (error instanceof Error ? error.message : 'Unknown publish error').slice(0, 2000) }
        });
        failed += 1;
      }
    }
    return { published, failed };
  }

  private async claimOne() {
    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - 5 * 60 * 1000);
    const eligible = { publishedAt: null, deadLetteredAt: null, attempts: { lt: MAX_DELIVERY_ATTEMPTS }, AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, { OR: [{ publishingAt: null }, { publishingAt: { lt: leaseCutoff } }] }] };
    return this.db.$transaction(async tx => {
      const event = await tx.outboxEvent.findFirst({ where: eligible, orderBy: { occurredAt: 'asc' } });
      if (!event) return null;
      const claimedAt = new Date();
      const result = await tx.outboxEvent.updateMany({ where: { id: event.id, ...eligible }, data: { publishingAt: claimedAt, attempts: { increment: 1 } } });
      if (result.count !== 1) return null;
      return { ...event, publishingAt: claimedAt };
    });
  }
}
