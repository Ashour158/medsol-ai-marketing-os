-- R2E-C: enrich canonical immutable provider observations, no new receipt ledger.
-- Historical R2E-A observations remain NULL and never acquire fictional post identity.
ALTER TABLE "ProviderWebhookObservation"
 ADD COLUMN "candidateAccountDigest" TEXT,
 ADD COLUMN "candidatePostDigest" TEXT,
 ADD COLUMN "candidateEventAt" TIMESTAMP(3);

-- PostgreSQL CHECK treats UNKNOWN as success: require explicit non-null fields.
-- SHA-256 hex form enforced with exact length and anchored prefix checks.
ALTER TABLE "ProviderWebhookObservation"
 ADD CONSTRAINT "ProviderWebhookObs_candidate_shape" CHECK (
  ("candidateAccountDigest" IS NULL AND "candidatePostDigest" IS NULL AND "candidateEventAt" IS NULL)
  OR
  ("candidateAccountDigest" IS NOT NULL AND "candidatePostDigest" IS NOT NULL AND
   "candidateEventAt" IS NOT NULL AND
   length("candidateAccountDigest")=71 AND
   length("candidatePostDigest")=71 AND
   left("candidateAccountDigest",7)='sha256:' AND
   left("candidatePostDigest",7)='sha256:' AND
   substring("candidateAccountDigest" from 8) ~ '^[a-f0-9]{64}' AND
   substring("candidatePostDigest" from 8) ~ '^[a-f0-9]{64}')
 );

CREATE INDEX "ProviderWebhookObs_org_conn_post_idx"
 ON "ProviderWebhookObservation"("organizationId","integrationConnectionId","candidatePostDigest");

-- Existing R2E-A trigger forbids all UPDATE and DELETE, including on new fields.
-- Signed event candidates remain QUARANTINED and publication remains SANDBOX-only.
