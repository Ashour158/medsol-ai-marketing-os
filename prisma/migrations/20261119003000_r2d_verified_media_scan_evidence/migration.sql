-- R2D expands the existing authoritative VerifiedMediaEvidence; no parallel proof table.
-- All legacy observations remain NOT_SCANNED and are never retroactively trusted.
ALTER TABLE "VerifiedMediaEvidence"
 ADD COLUMN "malwareScanStatus" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
 ADD COLUMN "scannerId" TEXT;
ALTER TABLE "VerifiedMediaEvidence"
 ADD CONSTRAINT "VerifiedMediaEvidence_scan_status_check"
 CHECK ("malwareScanStatus" IN ('NOT_SCANNED','CLEAN'));
ALTER TABLE "VerifiedMediaEvidence"
 ADD CONSTRAINT "VerifiedMediaEvidence_scan_provenance_check"
 CHECK (
  ("malwareScanStatus"='NOT_SCANNED' AND "scannerId" IS NULL)
  OR ("malwareScanStatus"='CLEAN' AND "scannerId" ~ '^[A-Za-z0-9_.-]{3,80}$')
 );

-- Extend the canonical readback immutable-proof guard, preserving all R2B
-- revocation and content protection while covering new scanner provenance.
CREATE OR REPLACE FUNCTION protect_verified_media_evidence() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."creativeAssetRevisionId",
        NEW."sourceRef",NEW."objectVersion",NEW."sha256Digest",
        NEW."sizeBytes",NEW."detectedMime",NEW."verifiedAt",NEW."verifiedBy",
        NEW."malwareScanStatus",NEW."scannerId")
  IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."creativeAssetRevisionId",
        OLD."sourceRef",OLD."objectVersion",OLD."sha256Digest",
        OLD."sizeBytes",OLD."detectedMime",OLD."verifiedAt",OLD."verifiedBy",
        OLD."malwareScanStatus",OLD."scannerId")
 THEN RAISE EXCEPTION 'Verified media proof is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."status"='REVOKED' AND ROW(NEW."status",NEW."revokedAt",NEW."revokedBy")
  IS DISTINCT FROM ROW(OLD."status",OLD."revokedAt",OLD."revokedBy")
 THEN RAISE EXCEPTION 'Revoked media evidence is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- FORCE RLS does not protect against table owners/BYPASSRLS.
-- A trigger forbids deleting evidence independently of RLS privileges.
CREATE FUNCTION r2d_deny_verified_media_delete() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'Verified media evidence cannot be deleted' USING ERRCODE='23514';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "VerifiedMediaEvidence_deny_delete"
 BEFORE DELETE ON "VerifiedMediaEvidence" FOR EACH ROW
 EXECUTE FUNCTION r2d_deny_verified_media_delete();
