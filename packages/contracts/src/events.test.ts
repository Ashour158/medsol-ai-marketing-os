import { describe, expect, it } from 'vitest';
import { DomainEventSchema } from './events.js';
import { TransitionCampaignCommandSchema } from './commands.js';

describe('contract invariants', () => {
  it('requires versioned aggregate event metadata', () => {
    const parsed = DomainEventSchema.parse({
      eventId: 'evt-1', eventType: 'CampaignStatusChanged', eventVersion: 1,
      organizationId: 'org-1', occurredAt: new Date().toISOString(), correlationId: 'corr-1',
      aggregateType: 'Campaign', aggregateId: 'cmp-1', aggregateVersion: 2,
      payload: { campaignId: 'cmp-1', to: 'APPROVED' }
    });
    expect(parsed.aggregateVersion).toBe(2);
  });
  it('rejects arbitrary campaign lifecycle states', () => {
    expect(() => TransitionCampaignCommandSchema.parse({
      commandId: 'cmd-1', organizationId: 'org-1', correlationId: 'corr-1', campaignId: 'cmp-1', to: 'NOT_A_STATE'
    })).toThrow();
  });
  it('accepts an optimistic concurrency version', () => {
    const parsed = TransitionCampaignCommandSchema.parse({
      commandId: 'cmd-1', organizationId: 'org-1', correlationId: 'corr-1', campaignId: 'cmp-1', to: 'ASSESSMENT', expectedVersion: 1
    });
    expect(parsed.expectedVersion).toBe(1);
  });
});
