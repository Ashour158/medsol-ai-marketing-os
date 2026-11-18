-- R2B additive provider-neutral integration metadata and server-verified
-- media-byte evidence. No OAuth tokens, client secrets or live send capability.
CREATE TABLE "IntegrationConnection" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "brandId" TEXT NOT NULL,
 "providerKey" TEXT NOT NULL,
 "destinationLabel" TEXT NOT NULL,
 "destinationRef" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdBy" TEXT NOT NULL,
 "suspendedAt" TIMESTAMP(3),
 "suspendedBy" TEXT,
 "revokedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "IntegrationConnection_status_guard" CHECK
  ("status" IN ('PENDING_VERIFICATION','SUSPENDED','REVOKED')),
 CONSTRAINT "IntegrationConnection_version_positive" CHECK ("version">0),
 CONSTRAINT "IntegrationConnection_destination_ref_check" CHECK
  ("destinationRef" LIKE 'internal:connected-destination/%'),
 CONSTRAINT "IntegrationConnection_revocation_monotonic" CHECK (
  ("status"='REVOKED' AND "revokedAt" IS NOT NULL AND "revokedBy" IS NOT NULL) OR
  ("status"<>'REVOKED' AND "revokedAt" IS NULL AND "revokedBy" IS NULL)
 )
);
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_id_key"
 ON "IntegrationConnection"("organizationId","id");
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_destinationRef_key"
 ON "IntegrationConnection"("organizationId","destinationRef");
CREATE UNIQUE INDEX "IntegrationConnection_brand_provider_dest_key"
 ON "IntegrationConnection"("organizationId","brandId","providerKey","destinationLabel");
CREATE INDEX "IntegrationConnection_organizationId_brandId_status_idx"
 ON "IntegrationConnection"("organizationId","brandId","status");
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_brandId_fkey"
 FOREIGN KEY ("organizationId","brandId") REFERENCES "Brand"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VerifiedMediaEvidence" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "creativeAssetRevisionId" TEXT NOT NULL,
 "sourceRef" TEXT NOT NULL,
 "objectVersion" TEXT NOT NULL,
 "sha256Digest" TEXT NOT NULL,
 "sizeBytes" INTEGER NOT NULL,
 "detectedMime" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'VERIFIED_READBACK',
 "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "verifiedBy" TEXT NOT NULL,
 "revokedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 CONSTRAINT "VerifiedMediaEvidence_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VerifiedMediaEvidence_status_guard" CHECK
  ("status" IN ('VERIFIED_READBACK','REVOKED')),
 CONSTRAINT "VerifiedMediaEvidence_sha_check" CHECK
  ("sha256Digest" ~ '^sha256:[0-9a-f]{64}$'),
 CONSTRAINT "VerifiedMediaEvidence_size_check" CHECK
  ("sizeBytes" BETWEEN 1 AND 25165824),
 CONSTRAINT "VerifiedMediaEvidence_mime_check" CHECK
  ("detectedMime" IN ('image/png','image/jpeg','image/webp')),
 CONSTRAINT "VerifiedMediaEvidence_source_ref_check" CHECK
  ("sourceRef" LIKE 'internal:creative-source/%'),
 CONSTRAINT "VerifiedMediaEvidence_revocation_check" CHECK (
   ("status"='REVOKED' AND "revokedAt" IS NOT NULL AND "revokedBy" IS NOT NULL) OR
   ("status"<>'REVOKED' AND "revokedAt" IS NULL AND "revokedBy" IS NULL)
 )
);
CREATE UNIQUE INDEX "VerifiedMediaEvidence_organizationId_id_key"
 ON "VerifiedMediaEvidence"("organizationId","id");
CREATE UNIQUE INDEX "VerifiedMediaEvidence_org_revision_key"
 ON "VerifiedMediaEvidence"("organizationId","creativeAssetRevisionId");
CREATE INDEX "VerifiedMediaEvidence_organizationId_status_verifiedAt_idx"
 ON "VerifiedMediaEvidence"("organizationId","status","verifiedAt");
ALTER TABLE "VerifiedMediaEvidence" ADD CONSTRAINT "VerifiedMediaEvidence_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VerifiedMediaEvidence" ADD CONSTRAINT "VerifiedMediaEvidence_organizationId_creativeAssetRevision_fkey"
 FOREIGN KEY ("organizationId","creativeAssetRevisionId")
 REFERENCES "CreativeAssetRevision"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

-- Source registration cannot be promoted to provider verified by DB writes.
-- Origin/destination fixed; legal suspension or revocation are monotonic.
CREATE FUNCTION protect_integration_registration() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."brandId",NEW."providerKey",
        NEW."destinationLabel",NEW."destinationRef",NEW."createdBy",NEW."createdAt")
  IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."brandId",
        OLD."providerKey",OLD."destinationLabel",OLD."destinationRef",
        OLD."createdBy",OLD."createdAt")
 THEN RAISE EXCEPTION 'Connection registration identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."status"='REVOKED' AND ROW(NEW."status",NEW."revokedAt",NEW."revokedBy")
  IS DISTINCT FROM ROW(OLD."status",OLD."revokedAt",OLD."revokedBy")
 THEN RAISE EXCEPTION 'Revoked connection is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."status"='SUSPENDED' AND NEW."status"='PENDING_VERIFICATION'
 THEN RAISE EXCEPTION 'Suspended connection cannot be silently restored' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "IntegrationConnection_protect_identity"
 BEFORE UPDATE ON "IntegrationConnection" FOR EACH ROW
 EXECUTE FUNCTION protect_integration_registration();

-- Evidence content is immutable; only monotonic revocation may change.
CREATE FUNCTION protect_verified_media_evidence() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."creativeAssetRevisionId",
        NEW."sourceRef",NEW."objectVersion",NEW."sha256Digest",
        NEW."sizeBytes",NEW."detectedMime",NEW."verifiedAt",NEW."verifiedBy")
  IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."creativeAssetRevisionId",
        OLD."sourceRef",OLD."objectVersion",OLD."sha256Digest",
        OLD."sizeBytes",OLD."detectedMime",OLD."verifiedAt",OLD."verifiedBy")
 THEN RAISE EXCEPTION 'Verified media proof is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."status"='REVOKED' AND ROW(NEW."status",NEW."revokedAt",NEW."revokedBy")
  IS DISTINCT FROM ROW(OLD."status",OLD."revokedAt",OLD."revokedBy")
 THEN RAISE EXCEPTION 'Revoked media evidence is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "VerifiedMediaEvidence_protect_evidence"
 BEFORE UPDATE ON "VerifiedMediaEvidence" FOR EACH ROW
 EXECUTE FUNCTION protect_verified_media_evidence();

-- Fail closed without transaction-local identity.
ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IntegrationConnection_tenant_select" ON "IntegrationConnection" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IntegrationConnection_tenant_insert" ON "IntegrationConnection" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IntegrationConnection_tenant_update" ON "IntegrationConnection" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IntegrationConnection_tenant_delete_deny" ON "IntegrationConnection"
 AS RESTRICTIVE FOR DELETE USING (false);

ALTER TABLE "VerifiedMediaEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerifiedMediaEvidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "VerifiedMediaEvidence_tenant_select" ON "VerifiedMediaEvidence" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "VerifiedMediaEvidence_tenant_insert" ON "VerifiedMediaEvidence" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "VerifiedMediaEvidence_tenant_update" ON "VerifiedMediaEvidence" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "VerifiedMediaEvidence_tenant_delete_deny" ON "VerifiedMediaEvidence"
 AS RESTRICTIVE FOR DELETE USING (false);
