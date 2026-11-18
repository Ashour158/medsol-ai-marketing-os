import { ForbiddenException } from '@nestjs/common';

export type CampaignAuthorship = { actorType: string; actorId: string; action: string };
const submissionActions = new Set(['CAMPAIGN_CREATED', 'CAMPAIGN_STATUS_CHANGED']);

/**
 * Fail closed if the approval target has no provenance. Human campaign authors
 * and submitters must never approve their own campaigns.
 */
export function assertIndependentCampaignReviewer(
  approverUserId: string,
  history: CampaignAuthorship[]
): void {
  if (!history.some(event => event.action === 'CAMPAIGN_CREATED')) {
    throw new ForbiddenException('Campaign provenance is missing; independent review cannot be established');
  }
  if (history.some(event => event.actorType === 'HUMAN' && submissionActions.has(event.action) && event.actorId === approverUserId)) {
    throw new ForbiddenException('Campaign authors and submitters cannot approve their own work');
  }
}
