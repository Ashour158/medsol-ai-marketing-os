-- Historical simulations without sender-authentication fixtures remain valid.
-- Explicit fixture decisions cannot masquerade as real authentication or dispatch.
ALTER TABLE "MarketingEmailSimulation"
 ADD CONSTRAINT "MarketingEmailSimulation_sender_domain_fixture_gate" CHECK (
  (COALESCE("result"->'senderDomainPreflight','null'::jsonb)='null'::jsonb
   AND "result"->>'senderDomainScenario' IS NULL
   AND COALESCE("result"->>'domainBlockedEligible','0')='0')
  OR COALESCE((
   jsonb_typeof("result"->'senderDomainPreflight')='object'
   AND "result"->'senderDomainPreflight'->>'scenario'="result"->>'senderDomainScenario'
   AND "result"->>'senderDomainScenario' IN ('ALIGNED','SPF_MISSING','SPF_PERMERROR','DKIM_MISSING','DKIM_MISALIGNED','DMARC_MISSING','DMARC_MONITOR_ONLY','AUTH_TEMPERROR')
   AND "result"->'senderDomainPreflight'->>'fixtureOnly'='true'
   AND "result"->'senderDomainPreflight'->>'senderDomainVerified'='false'
   AND "result"->'senderDomainPreflight'->>'realDnsQueries'='0'
   AND "result"->'senderDomainPreflight'->>'realSignatureChecks'='0'
   AND "result"->'senderDomainPreflight'->>'providerEntitlementVerified'='false'
   AND "result"->'senderDomainPreflight'->>'realDeliverabilityVerified'='false'
   AND "result"->'senderDomainPreflight'->>'externalEffectsAuthorized'='false'
   AND (
    ("result"->>'senderDomainScenario'='ALIGNED'
     AND "result"->'senderDomainPreflight'->>'fixtureEligible'='true'
     AND "result"->>'domainBlockedEligible'='0')
    OR ("result"->>'senderDomainScenario'<>'ALIGNED'
     AND "result"->'senderDomainPreflight'->>'fixtureEligible'='false'
     AND "status"='BLOCKED'
     AND "result"->>'domainBlockedEligible'="result"->>'syntheticEligible'
     AND "result"->'syntheticTransport'->>'simulatedEligible'='0'
     AND "result"->'syntheticTransport'->>'virtualAccepted'='0'
     AND "result"->'syntheticTransport'->>'virtualCallbackCount'='0'
     AND "result"->'syntheticTransport'->>'syntheticReadback'='UNAVAILABLE'
     AND COALESCE("result"->'syntheticJourneyPlan','null'::jsonb)='null'::jsonb)
   )
  ),FALSE)
 );
