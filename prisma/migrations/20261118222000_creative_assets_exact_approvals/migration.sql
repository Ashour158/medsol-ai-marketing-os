-- R1C additive and deliberately fail-closed: no migration backfills or
-- changes existing campaign approval behavior. Scoped creative metadata only.
CREATE TABLE "CreativeAsset" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "brandId" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "version" INTEGER NOT NULL DEFAULT 0,
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CreativeAsset_status_check" CHECK ("status" IN ('ACTIVE','RETIRED')),
 CONSTRAINT "CreativeAsset_version_check" CHECK ("version">=0)
);
CREATE UNIQUE INDEX "CreativeAsset_organizationId_id_key" ON "CreativeAsset"("organizationId","id");
CREATE INDEX "CreativeAsset_organizationId_brandId_status_idx" ON "CreativeAsset"("organizationId","brandId","status");
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_organizationId_brandId_fkey"
 FOREIGN KEY ("organizationId","brandId") REFERENCES "Brand"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CreativeAssetRevision" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "assetId" TEXT NOT NULL,
 "version" INTEGER NOT NULL,
 "sourceKind" TEXT NOT NULL,
 "sourceRef" TEXT NOT NULL,
 "renditionDigest" TEXT NOT NULL,
 "rightsExpiresAt" TIMESTAMP(3) NOT NULL,
 "rightsReviewedBy" TEXT,
 "rightsReviewedAt" TIMESTAMP(3),
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CreativeAssetRevision_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CreativeAssetRevision_sourceKind_check" CHECK ("sourceKind" IN ('EDITABLE_SOURCE','FLATTENED_EXPORT')),
 CONSTRAINT "CreativeAssetRevision_version_check" CHECK ("version">0),
 CONSTRAINT "CreativeAssetRevision_digest_check" CHECK ("renditionDigest" ~ '^sha256:[0-9a-f]{64}$'),
 CONSTRAINT "CreativeAssetRevision_review_check" CHECK (
   ("rightsReviewedBy" IS NULL AND "rightsReviewedAt" IS NULL) OR
   ("rightsReviewedBy" IS NOT NULL AND "rightsReviewedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "CreativeAssetRevision_organizationId_id_key" ON "CreativeAssetRevision"("organizationId","id");
CREATE UNIQUE INDEX "CreativeAssetRevision_assetId_version_key" ON "CreativeAssetRevision"("assetId","version");
CREATE INDEX "CreativeAssetRevision_organizationId_assetId_version_idx" ON "CreativeAssetRevision"("organizationId","assetId","version");
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeAssetRevision_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeAssetRevision_organizationId_assetId_fkey"
 FOREIGN KEY ("organizationId","assetId") REFERENCES "CreativeAsset"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Approval" ADD COLUMN "creativeAssetRevisionId" TEXT,
 ADD COLUMN "requestedBy" TEXT,
 ADD COLUMN "scopeDigest" TEXT,
 ADD COLUMN "scope" JSONB,
 ADD COLUMN "scopeExpiresAt" TIMESTAMP(3);
CREATE INDEX "Approval_organizationId_creativeAssetRevisionId_idx" ON "Approval"("organizationId","creativeAssetRevisionId");
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_organizationId_creativeAssetRevisionId_fkey"
 FOREIGN KEY ("organizationId","creativeAssetRevisionId")
 REFERENCES "CreativeAssetRevision"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Legacy campaigns have NULL exact scope fields; current campaign approvals
-- retain their previous semantics until separately migrated and reviewed.

-- Content identifiers and rights expiry must never be silently edited in place.
-- The only permitted revision update is a once-only independent rights review.
CREATE FUNCTION prevent_creative_revision_content_mutation() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."assetId",NEW."version",
         NEW."sourceKind",NEW."sourceRef",NEW."renditionDigest",
         NEW."rightsExpiresAt",NEW."createdBy",NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD."id",OLD."organizationId",OLD."assetId",OLD."version",
        OLD."sourceKind",OLD."sourceRef",OLD."renditionDigest",
        OLD."rightsExpiresAt",OLD."createdBy",OLD."createdAt")
 THEN
  RAISE EXCEPTION 'Immutable creative revision content cannot be changed'
    USING ERRCODE='23514';
 END IF;
 IF OLD."rightsReviewedAt" IS NOT NULL AND
    ROW(NEW."rightsReviewedBy",NEW."rightsReviewedAt")
    IS DISTINCT FROM ROW(OLD."rightsReviewedBy",OLD."rightsReviewedAt")
 THEN
  RAISE EXCEPTION 'Rights review is immutable after first decision'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CreativeAssetRevision_protect_content"
 BEFORE UPDATE ON "CreativeAssetRevision"
 FOR EACH ROW EXECUTE FUNCTION prevent_creative_revision_content_mutation();

-- Scope is set exclusively via transaction-local trusted server context.
-- FORCE RLS applies even when the app database role owns the tables.
ALTER TABLE "CreativeAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreativeAsset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CreativeAsset_tenant_select" ON "CreativeAsset" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CreativeAsset_tenant_insert" ON "CreativeAsset" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CreativeAsset_tenant_update" ON "CreativeAsset" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CreativeAsset_tenant_delete_deny" ON "CreativeAsset" AS RESTRICTIVE
 FOR DELETE USING (false);

ALTER TABLE "CreativeAssetRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreativeAssetRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CreativeAssetRevision_tenant_select" ON "CreativeAssetRevision" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CreativeAssetRevision_tenant_insert" ON "CreativeAssetRevision" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CreativeAssetRevision_tenant_update" ON "CreativeAssetRevision" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CreativeAssetRevision_tenant_delete_deny" ON "CreativeAssetRevision" AS RESTRICTIVE
 FOR DELETE USING (false);

-- Approvals for creative objects require a scope digest and independently
-- requested identity. Other legacy approval objects remain unaffected.
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_creative_scope_required"
 CHECK ("objectType"<>'CreativeAssetRevision' OR
   ("creativeAssetRevisionId" IS NOT NULL AND "scopeDigest" ~ '^sha256:[0-9a-f]{64}$'
    AND "requestedBy" IS NOT NULL AND "scope" IS NOT NULL
    AND "scopeExpiresAt" IS NOT NULL));
