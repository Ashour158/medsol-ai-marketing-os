import { describe, expect, it, vi } from 'vitest';
import { OutboxPublisherService, MAX_DELIVERY_ATTEMPTS, deliveryDelayMs } from './outbox-publisher.service.js';
import { DeliveryOperationsService } from './delivery-operations.service.js';
import { permissionForMarketingRoute, hasMarketingPermission } from './marketing-permissions.js';

function fixture(attempts = 0) {
  const event = { id: 'row', eventId: 'event', organizationId: 'tenant', eventType: 'CAMPAIGN_CREATED',
    aggregateType: 'CAMPAIGN', aggregateId: 'campaign', version: 1, payload: {}, correlationId: 'corr',
    publishingAt: null, publishedAt: null, attempts, occurredAt: new Date() };
  const db: any = { outboxEvent: {
    findFirst: vi.fn().mockResolvedValueOnce(event).mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(1),
    findMany: vi.fn().mockResolvedValue([])
  } };
  db.organization={findMany:vi.fn().mockResolvedValue([{id:'tenant'}])};
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$transaction = vi.fn(async (fn: (tx: any) => Promise<any>) => fn(db));
  return { db, publisher: new OutboxPublisherService(db), monitor: new DeliveryOperationsService(db) };
}
describe('durable outbox retry policy', () => {
  it('schedules exponential backoff with a one-hour ceiling', () => {
    expect(deliveryDelayMs(1)).toBe(1000);
    expect(deliveryDelayMs(2)).toBe(2000);
    expect(deliveryDelayMs(30)).toBe(3600000);
  });
  it('reschedules failed deliveries without acknowledging them', async () => {
    const { db, publisher } = fixture();
    await expect(publisher.publishBatch({ publish: vi.fn().mockRejectedValue(new Error('offline')) }, 1))
      .resolves.toEqual({ published: 0, failed: 1 });
    expect(db.outboxEvent.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publishingAt: null, nextAttemptAt: expect.any(Date), lastError: 'offline' })
    }));
  });
  it('dead-letters events after the bounded attempt count', async () => {
    const { db, publisher } = fixture(MAX_DELIVERY_ATTEMPTS - 1);
    await publisher.publishBatch({ publish: vi.fn().mockRejectedValue(new Error('permanent')) }, 1);
    expect(db.outboxEvent.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deadLetteredAt: expect.any(Date), nextAttemptAt: null })
    }));
  });
  it('publishes with a stable event ID for consumer deduplication', async () => {
    const { db, publisher } = fixture();
    const publish = vi.fn().mockResolvedValue(undefined);
    await expect(publisher.publishBatch({ publish }, 1)).resolves.toEqual({ published: 1, failed: 0 });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'event', organizationId: 'tenant' }));
    expect(db.outboxEvent.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publishedAt: expect.any(Date), nextAttemptAt: null })
    }));
  });
  it('restricts dead-letter visibility to audit roles and scopes queries to tenant', async () => {
    const { db, monitor } = fixture();
    expect(permissionForMarketingRoute('GET','/marketing/operations/delivery')).toBe('READ_AUDIT');
    expect(hasMarketingPermission({role:'VIEWER'} as any,'READ_AUDIT')).toBe(false);
    await monitor.summary('tenant');
    expect(db.outboxEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'tenant', deadLetteredAt: { not: null } }
    }));
  });
});
