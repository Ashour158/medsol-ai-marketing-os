import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class InboxService {
  constructor(private readonly db: PrismaService) {}

  async begin(organizationId: string, consumerName: string, eventId: string): Promise<{ duplicate: boolean; id: string }> {
    try {
      const row = await this.db.inboxEvent.create({ data: { organizationId, consumerName, eventId, status: 'RECEIVED' } });
      return { duplicate: false, id: row.id };
    } catch (error) {
      const existing = await this.db.inboxEvent.findUnique({ where: { organizationId_consumerName_eventId: { organizationId, consumerName, eventId } } });
      if (existing) return { duplicate: true, id: existing.id };
      throw error;
    }
  }

  async complete(id: string): Promise<void> {
    await this.db.inboxEvent.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date(), lastError: null } });
  }

  async fail(id: string, error: unknown): Promise<void> {
    await this.db.inboxEvent.update({ where: { id }, data: { status: 'FAILED', attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : 'Unknown error' } });
  }
}
