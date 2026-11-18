-- R2E-C: enrich canonical, immutable, signed provider observations only.
-- No new delivery engine, remote publication status, or shadow receipt ledger.
ALTER TABLE "ProviderWebhookObservation"
 ADD COLUMN "candidateAccountDigest" TEXT,
 ADD COLUMN "candidatePostDigest" TEXT,
 ADD COLUMN "candidateEventAt" TIMESTAMP(3);

-- Either all claimed references are present, or none. Older R2E-A events
-- remain uncorrelated; the migration never invents provider post identity.
ALTER TABLE "ProviderWebhookObservation"
 ADD CONSTRAINT "ProviderWebhookObs_candidate_shape" CHECK (
  ("candidateAccountDigest" IS NULL AND "candidatePostDigest" IS NULL AND "candidateEventAt" IS NULL)
  OR
  ("candidateAccountDigest" IS NOT NULL AND "candidatePostDigest" IS NOT NULL
   AND "candidateEventAt" IS NOT NULL
   AND "candidateAccountDigest" ~ '^sha256:[a-f0-9]{64}
   AND "candidateEventAt" IS NOT NULL)
 );
CREATE INDEX "ProviderWebhookObs_org_conn_post_idx"
 ON "ProviderWebhookObservation"("organizationId","integrationConnectionId","candidatePostDigest");

-- The R2E-A trigger r2e_protect_webhook_observation rejects ALL UPDATE and
-- DELETE operations, including on these three additional immutable columns.
-- Status stays QUARANTINED. The existing PublicationAttempt sandbox-only
-- check remains intact; no claimed remote delivery is ever promoted.

   AND "candidatePostDigest" ~ '^sha256:[a-f0-9]{64}
   AND "candidateEventAt" IS NOT NULL)
 );
CREATE INDEX "ProviderWebhookObs_org_conn_post_idx"
 ON "ProviderWebhookObservation"("organizationId","integrationConnectionId","candidatePostDigest");

-- The R2E-A trigger r2e_protect_webhook_observation rejects ALL UPDATE and
-- DELETE operations, including on these three additional immutable columns.
-- Status stays QUARANTINED. The existing PublicationAttempt sandbox-only
-- check remains intact; no claimed remote delivery is ever promoted.

   AND "candidateEventAt" IS NOT NULL)
 );
CREATE INDEX "ProviderWebhookObs_org_conn_post_idx"
 ON "ProviderWebhookObservation"("organizationId","integrationConnectionId","candidatePostDigest");

-- The R2E-A trigger r2e_protect_webhook_observation rejects ALL UPDATE and
-- DELETE operations, including on these three additional immutable columns.
-- Status stays QUARANTINED. The existing PublicationAttempt sandbox-only
-- check remains intact; no claimed remote delivery is ever promoted.
