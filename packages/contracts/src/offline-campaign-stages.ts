/** Canonical signed-tenant OFFLINE journey stage names and operator navigation.
 * MarketingReadService owns the stage values; this contract only defines keys.
 * Do not use a completed simulation stage to authorize a provider side effect.
 */
export const OFFLINE_CAMPAIGN_STAGE_ORDER=[
 ["briefRecorded","Brief and workflow recorded","journey"],
 ["agentResearchReviewed","Agent research evaluated","agent-brain"],
 ["campaignIndependentlyApproved","Independent campaign approval","approvals"],
 ["creativeDraftAvailable","Creative draft exists","creative"],
 ["creativeRightsReviewed","Creative usage rights checked","creative"],
 ["creativeIndependentlyApproved","Independent creative approval","approvals"],
 ["simulatedSocialPublished","Sandbox social simulation","social"],
 ["syntheticEmailSimulated","Synthetic consent-gated email","email"],
 ["performanceReviewed","Reviewed performance evidence","performance"],
 ["learningFeedbackQuarantined","Learning evidence quarantined","knowledge"]
] as const;
export type OfflineCampaignStage=typeof OFFLINE_CAMPAIGN_STAGE_ORDER[number][0];
export const OFFLINE_CAMPAIGN_STAGE_KEYS=
 OFFLINE_CAMPAIGN_STAGE_ORDER.map(x=>x[0]) as OfflineCampaignStage[];
