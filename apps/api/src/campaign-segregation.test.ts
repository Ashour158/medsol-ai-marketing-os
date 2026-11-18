import { describe, expect, it } from 'vitest';
import { assertIndependentCampaignReviewer } from './campaign-segregation.js';

const created = (actorType: string, actorId: string) => ({ actorType, actorId, action: 'CAMPAIGN_CREATED' });
const submitted = (actorType: string, actorId: string) => ({ actorType, actorId, action: 'CAMPAIGN_STATUS_CHANGED' });
describe('campaign segregation of duties', () => {
  it('rejects self-approval by campaign author', () => {
    expect(() => assertIndependentCampaignReviewer('author', [created('HUMAN','author')])).toThrow('cannot approve');
  });
  it('rejects self-approval by campaign submitter', () => {
    expect(() => assertIndependentCampaignReviewer('submitter', [created('AGENT','MKT-OPS-001'),submitted('HUMAN','submitter')])).toThrow('cannot approve');
  });
  it('allows independent reviewer for an agent-created campaign', () => {
    expect(() => assertIndependentCampaignReviewer('reviewer', [created('AGENT','MKT-OPS-001'),submitted('HUMAN','author')])).not.toThrow();
  });
  it('fails closed if campaign provenance is missing', () => {
    expect(() => assertIndependentCampaignReviewer('reviewer', [])).toThrow('provenance');
  });
  it('does not confuse system actors with human identities', () => {
    expect(() => assertIndependentCampaignReviewer('MKT-OPS-001', [created('AGENT','MKT-OPS-001')])).not.toThrow();
  });
});
