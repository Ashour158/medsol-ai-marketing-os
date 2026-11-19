-- R2-J: extend existing R2H immutable MarketingEmailSimulation result.
-- No new email table, ESP provider, actual contact or send authority.
-- Historical R2H and R2I records without a journey remain valid.
ALTER TABLE "MarketingEmailSimulation"
 ADD CONSTRAINT "MarketingEmailSimulation_virtual_journey_no_egress" CHECK (
  NOT ("result" ? 'syntheticJourneyPlan') OR
  "result"->'syntheticJourneyPlan'='null'::jsonb OR
  COALESCE((
   jsonb_typeof("result"->'syntheticJourneyPlan')='object'
   AND "result"->>'syntheticJourneyDigest' ~ '^sha256:[a-f0-9]{64}$'
   AND "result"->'syntheticJourneyPlan'->>'syntheticOnly'='true'
   AND "result"->'syntheticJourneyPlan'->>'actualMessagesSent'='0'
   AND "result"->'syntheticJourneyPlan'->>'realProviderRequests'='0'
   AND "result"->'syntheticJourneyPlan'->>'verifiedProviderReceipts'='0'
   AND "result"->'syntheticJourneyPlan'->>'externalEffectsAuthorized'='false'
   AND "result"->'syntheticJourneyPlan'->>'automaticRetryAllowed'='false'
   AND "result"->'syntheticJourneyPlan'->>'requiresFreshConsentAtExecution'='true'
   AND jsonb_typeof("result"->'syntheticJourneyPlan'->'steps')='array'
   AND jsonb_array_length("result"->'syntheticJourneyPlan'->'steps') BETWEEN 1 AND 8
  ),FALSE)
 );
