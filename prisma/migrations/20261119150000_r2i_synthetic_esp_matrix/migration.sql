-- R2-I: strengthen the existing R2H immutable, tenant-FORCE-RLS email
-- simulation authority. No new email sender, table or provider credential.
-- Historical R2H snapshots without syntheticTransport remain immutable/valid.
ALTER TABLE "MarketingEmailSimulation"
 ADD CONSTRAINT "MarketingEmailSimulation_synthetic_transport_no_egress" CHECK (
  NOT ("result" ? 'syntheticTransport') OR COALESCE((
   jsonb_typeof("result"->'syntheticTransport')='object'
   AND "result"->'syntheticTransport'->>'scenario'
       = "result"->>'syntheticTransportScenario'
   AND "result"->'syntheticTransport'->>'scenario' IN (
    'ACCEPTED','BOUNCED','COMPLAINT','RATE_LIMITED','ESP_5XX',
    'TIMEOUT_AFTER_ACCEPT','DUPLICATE_CALLBACK','UNSUBSCRIBE_BEFORE_SEND',
    'DELAYED_WEBHOOK','TEMPLATE_REJECTED','TOKEN_EXPIRED','READBACK_MISMATCH'
   )
   AND "result"->'syntheticTransport'->>'realProviderRequests'='0'
   AND "result"->'syntheticTransport'->>'actualMessagesSent'='0'
   AND "result"->'syntheticTransport'->>'verifiedProviderReceipts'='0'
   AND "result"->'syntheticTransport'->>'externalEffectsAuthorized'='false'
   AND "result"->'syntheticTransport'->>'automaticRetryAllowed'='false'
   AND "result"->'syntheticTransport'->>'virtualRequestRef'
       ~ '^internal:synthetic-esp/[a-f0-9]{64}$'
  ), FALSE)
 );
