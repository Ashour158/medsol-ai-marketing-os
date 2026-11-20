-- R3-O: keep all creative, rights, media proof and approvals within their
-- existing authoritative owner tables. Synthetic raster bytes are NOT an
-- object-store credential, malware scan, real creative rights or provider proof.
ALTER TABLE "CreativeAssetRevision"
 ADD COLUMN "offlineRasterBase64" TEXT,
 ADD COLUMN "offlineEditableCopy" TEXT;
ALTER TABLE "CreativeAssetRevision"
 ADD CONSTRAINT "CreativeRevision_offline_raster_shape" CHECK (
  ("offlineRasterBase64" IS NULL AND "offlineEditableCopy" IS NULL)
  OR ("sourceKind"='FLATTENED_EXPORT' AND
      "sourceRef" ~ '^internal:creative-source/offline/[a-zA-Z0-9_-]{12,128}$'
      AND "offlineRasterBase64" ~ '^[A-Za-z0-9+/]+={0,2}$'
      AND length("offlineRasterBase64") BETWEEN 24 AND 1398104
      AND length("offlineEditableCopy") BETWEEN 12 AND 4000)
 );
-- Extend the existing content-integrity trigger: newly added offline bytes
-- and copy are immutable, too. The only revision update remains rights review.
CREATE OR REPLACE FUNCTION prevent_creative_revision_content_mutation() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."assetId",NEW."version",
         NEW."sourceKind",NEW."sourceRef",NEW."renditionDigest",
         NEW."offlineRasterBase64",NEW."offlineEditableCopy",
         NEW."rightsExpiresAt",NEW."createdBy",NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD."id",OLD."organizationId",OLD."assetId",OLD."version",
        OLD."sourceKind",OLD."sourceRef",OLD."renditionDigest",
        OLD."offlineRasterBase64",OLD."offlineEditableCopy",
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

ALTER TABLE "VerifiedMediaEvidence"
 ADD COLUMN "evidenceOrigin" TEXT NOT NULL DEFAULT 'VERSIONED_OBJECT_STORE';
ALTER TABLE "VerifiedMediaEvidence"
 ADD CONSTRAINT "VerifiedMediaEvidence_origin_check"
 CHECK ("evidenceOrigin" IN ('VERSIONED_OBJECT_STORE','OFFLINE_DB_RASTER'));
-- Never allow a synthetic raster to impersonate scanned remote media evidence.
ALTER TABLE "VerifiedMediaEvidence"
 ADD CONSTRAINT "VerifiedMediaEvidence_offline_never_scanned" CHECK (
   "evidenceOrigin"<>'OFFLINE_DB_RASTER'
   OR ("malwareScanStatus"='NOT_SCANNED' AND "scannerId" IS NULL)
 );
-- Extend canonical media proof immutability with origin.
CREATE OR REPLACE FUNCTION protect_verified_media_evidence() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."creativeAssetRevisionId",
        NEW."sourceRef",NEW."objectVersion",NEW."sha256Digest",
        NEW."sizeBytes",NEW."detectedMime",NEW."verifiedAt",NEW."verifiedBy",
        NEW."malwareScanStatus",NEW."scannerId",NEW."evidenceOrigin")
  IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."creativeAssetRevisionId",
        OLD."sourceRef",OLD."objectVersion",OLD."sha256Digest",
        OLD."sizeBytes",OLD."detectedMime",OLD."verifiedAt",OLD."verifiedBy",
        OLD."malwareScanStatus",OLD."scannerId",OLD."evidenceOrigin")
 THEN RAISE EXCEPTION 'Verified media proof is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."status"='REVOKED' AND ROW(NEW."status",NEW."revokedAt",NEW."revokedBy")
  IS DISTINCT FROM ROW(OLD."status",OLD."revokedAt",OLD."revokedBy")
 THEN RAISE EXCEPTION 'Revoked media evidence is immutable'
   USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
