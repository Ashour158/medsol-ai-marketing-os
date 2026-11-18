import { describe, expect, it } from 'vitest';
import { assertCampaignTransition, canTransitionCampaign } from './index.js';

describe('campaign lifecycle', () => {
  it('accepts only declared forward transitions', () => {
    expect(canTransitionCampaign('IDEA', 'ASSESSMENT')).toBe(true);
    expect(canTransitionCampaign('ASSESSMENT', 'PROPOSED')).toBe(true);
    expect(canTransitionCampaign('IDEA', 'APPROVED')).toBe(false);
    expect(canTransitionCampaign('ARCHIVED', 'IDEA')).toBe(false);
  });
  it('rejects invalid transitions', () => {
    expect(() => assertCampaignTransition('IDEA', 'APPROVED')).toThrow('Invalid campaign transition');
  });
  it('supports optimization loop', () => {
    expect(canTransitionCampaign('LIVE', 'OPTIMIZING')).toBe(true);
    expect(canTransitionCampaign('OPTIMIZING', 'LIVE')).toBe(true);
    expect(canTransitionCampaign('OPTIMIZING', 'COMPLETED')).toBe(true);
  });
});
