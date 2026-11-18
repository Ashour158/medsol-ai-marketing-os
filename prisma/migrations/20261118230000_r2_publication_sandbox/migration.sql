-- R2: additive brand-scoped campaign planning and an internal-only
-- publication intent. The schema itself prohibits a PUBLISHED state.
ALTER TABLE "Campaign" ADD COLUMN "brandId" TEXT;
CREATE INDEX "Campaign_organizationId_brandId_idx" ON "Campaign"("organizationId","brandId");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_brandId_fkey"
 FOREIGN KEY ("organizationId","brandId") REFERENCES "Brand"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Approval_organizationId_id_key"
 ON "Approval"("organizationId","id");

CREATE TABLE "CampaignPublication" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "campaignId" TEXT NOT NULL,
 "creativeAssetRevisionId" TEXT NOT NULL,
 "approvalId" TEXT NOT NULL,
 "scopeDigest" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PREPARED',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CampaignPublication_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CampaignPublication_valid_status" CHECK
  ("status" IN ('PREPARED','SIMULATED','BLOCKED','OUTCOME_UNKNOWN','CANCELLED')),
 CONSTRAINT "CampaignPublication_version_positive" CHECK ("version">=1),
 CONSTRAINT "CampaignPublication_valid_digest" CHECK ("scopeDigest" ~ '^sha256:[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "CampaignPublication_organizationId_id_key"
 ON "CampaignPublication"("organizationId","id");
CREATE UNIQUE INDEX "CampaignPublication_organizationId_requestKey_key"
 ON "CampaignPublication"("organizationId","requestKey");
CREATE UNIQUE INDEX "CampaignPublication_organizationId_approvalId_key"
 ON "CampaignPublication"("organizationId","approvalId");
CREATE INDEX "CampaignPublication_organizationId_campaignId_status_idx"
 ON "CampaignPublication"("organizationId","campaignId","status");
ALTER TABLE "CampaignPublication" ADD CONSTRAINT "CampaignPublication_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignPublication" ADD CONSTRAINT "CampaignPublication_organizationId_campaignId_fkey"
 FOREIGN KEY ("organizationId","campaignId") REFERENCES "Campaign"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignPublication" ADD CONSTRAINT "CampaignPublication_organizationId_creativeAssetRevisionId_fkey"
 FOREIGN KEY ("organizationId","creativeAssetRevisionId")
 REFERENCES "CreativeAssetRevision"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignPublication" ADD CONSTRAINT "CampaignPublication_organizationId_approvalId_fkey"
 FOREIGN KEY ("organizationId","approvalId") REFERENCES "Approval"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PublicationAttempt" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "publicationId" TEXT NOT NULL,
 "sequence" INTEGER NOT NULL,
 "mode" TEXT NOT NULL DEFAULT 'SANDBOX',
 "outcome" TEXT NOT NULL,
 "evidenceRef" TEXT NOT NULL,
 "inputDigest" TEXT NOT NULL,
 "recordedBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PublicationAttempt_sandbox_only" CHECK ("mode"='SANDBOX'),
 CONSTRAINT "PublicationAttempt_nonproduction_outcome" CHECK
  ("outcome" IN ('SIMULATED','BLOCKED','OUTCOME_UNKNOWN')),
 CONSTRAINT "PublicationAttempt_sequence_positive" CHECK ("sequence">0),
 CONSTRAINT "PublicationAttempt_digest" CHECK ("inputDigest" ~ '^sha256:[0-9a-f]{64}$'),
 CONSTRAINT "PublicationAttempt_internal_evidence" CHECK ("evidenceRef" LIKE 'internal:sandbox/%')
);
CREATE UNIQUE INDEX "PublicationAttempt_organizationId_publicationId_sequence_key"
 ON "PublicationAttempt"("organizationId","publicationId","sequence");
CREATE INDEX "PublicationAttempt_organizationId_publicationId_createdAt_idx"
 ON "PublicationAttempt"("organizationId","publicationId","createdAt");
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_organizationId_publicationId_fkey"
 FOREIGN KEY ("organizationId","publicationId")
 REFERENCES "CampaignPublication"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A publication's campaign, creative revision, scope and approval are fixed at
-- creation. Cancelling or simulating cannot silently retarget the payload.
CREATE FUNCTION r2_publication_immutable_identity() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."campaignId",NEW."creativeAssetRevisionId",
  NEW."approvalId",NEW."scopeDigest",NEW."requestKey",NEW."createdBy",NEW."createdAt")
  IS DISTINCT FROM
  ROW(OLD."id",OLD."organizationId",OLD."campaignId",OLD."creativeAssetRevisionId",
  OLD."approvalId",OLD."scopeDigest",OLD."requestKey",OLD."createdBy",OLD."createdAt")
 THEN RAISE EXCEPTION 'Immutable publication scope cannot be changed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CampaignPublication_immutable_identity"
 BEFORE UPDATE ON "CampaignPublication"
 FOR EACH ROW EXECUTE FUNCTION r2_publication_immutable_identity();

CREATE FUNCTION r2_publication_attempt_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Publication attempt evidence is append only' USING ERRCODE='23514';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PublicationAttempt_append_only"
 BEFORE UPDATE OR DELETE ON "PublicationAttempt"
 FOR EACH ROW EXECUTE FUNCTION r2_publication_attempt_append_only();

-- RLS is fail-closed without a trusted transaction-local tenant context.
ALTER TABLE "CampaignPublication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignPublication" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CampaignPublication_tenant_select" ON "CampaignPublication" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CampaignPublication_tenant_insert" ON "CampaignPublication" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CampaignPublication_tenant_update" ON "CampaignPublication" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CampaignPublication_tenant_delete_deny" ON "CampaignPublication"
 AS RESTRICTIVE FOR DELETE USING (false);

ALTER TABLE "PublicationAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicationAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PublicationAttempt_tenant_select" ON "PublicationAttempt" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "PublicationAttempt_tenant_insert" ON "PublicationAttempt" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "PublicationAttempt_tenant_update_deny" ON "PublicationAttempt"
 AS RESTRICTIVE FOR UPDATE USING (false);
CREATE POLICY "PublicationAttempt_tenant_delete_deny" ON "PublicationAttempt"
 AS RESTRICTIVE FOR DELETE USING (false);
