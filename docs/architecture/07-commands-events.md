# Command and Event Catalog

Commands are intent. Events are facts. Commands are validated by authoritative domain services. Events are immutable records suitable for publication.

## Initial commands
- CreateMarketingRequest
- AssessMarketingRequest
- CreateCampaign
- SubmitCampaignForApproval
- ApproveCampaign
- RejectCampaign
- StartCampaignPlanning
- PublishContent

## Initial events
- MarketingRequestReceived
- MarketingRequestAssessed
- CampaignCreated
- CampaignApprovalRequested
- CampaignApproved
- CampaignRejected
- CampaignPlanningStarted
- ContentPublished

Every event carries eventId, organizationId, occurredAt, correlationId and optional causationId.