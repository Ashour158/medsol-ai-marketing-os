-- Persist local unverified WebM drafts in the same canonical DAM revision.
ALTER TABLE "CreativeAssetRevision" ADD COLUMN "offlineMotionVideoBase64" TEXT;
ALTER TABLE "CreativeAssetRevision" DROP CONSTRAINT "CreativeRevision_rendition_shape";
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeRevision_rendition_shape" CHECK (
 ("offlineRenditionParentRevisionId" IS NULL AND "offlineRenditionSourceDigest" IS NULL) OR
 ("offlineRenditionParentRevisionId" IS NOT NULL AND "offlineRenditionSourceDigest" IS NOT NULL AND "offlineRenditionSourceDigest" ~ '^sha256:[a-f0-9]{64}$' AND ("offlineRasterBase64" IS NOT NULL OR "offlineMotionVideoBase64" IS NOT NULL) AND "offlineLayeredSpec" IS NULL AND "sourceKind"='FLATTENED_EXPORT'));
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeRevision_motion_video_shape" CHECK (
 ("offlineMotionVideoBase64" IS NULL AND "sourceRef" NOT LIKE 'internal:creative-source/motion/%') OR
 ("offlineMotionVideoBase64" IS NOT NULL AND "sourceRef" ~ '^internal:creative-source/motion/[A-Za-z0-9_-]{12,128}$' AND "offlineMotionVideoBase64" ~ '^[A-Za-z0-9+/]+={0,2}$' AND length("offlineMotionVideoBase64") BETWEEN 140 AND 1398104 AND "offlineRasterBase64" IS NULL AND "offlineEditableCopy" IS NULL AND "offlineLayeredSpec" IS NULL AND "offlineRenditionParentRevisionId" IS NOT NULL AND "sourceKind"='FLATTENED_EXPORT'));
CREATE FUNCTION medsol_motion_video_guard() RETURNS trigger LANGUAGE plpgsql AS $video$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW."offlineMotionVideoBase64" IS DISTINCT FROM OLD."offlineMotionVideoBase64" THEN RAISE EXCEPTION 'Immutable motion video bytes'; END IF;
 ELSIF NEW."offlineMotionVideoBase64" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "CreativeAssetRevision" p WHERE p."organizationId"=NEW."organizationId" AND p."assetId"=NEW."assetId" AND p."id"=NEW."offlineRenditionParentRevisionId" AND p."version"=NEW."version"-1 AND p."offlineLayeredSpec" ? 'motion' AND p."offlineLayeredSourceDigest"=NEW."offlineRenditionSourceDigest") THEN RAISE EXCEPTION 'Exact motion storyboard parent required'; END IF;
 END IF;
 RETURN NEW;
END;
$video$;
CREATE TRIGGER "CreativeRevision_motion_video_guard" BEFORE INSERT OR UPDATE ON "CreativeAssetRevision" FOR EACH ROW EXECUTE FUNCTION medsol_motion_video_guard();
ALTER TABLE "VerifiedMediaEvidence" DROP CONSTRAINT "VerifiedMediaEvidence_origin_check";
ALTER TABLE "VerifiedMediaEvidence" ADD CONSTRAINT "VerifiedMediaEvidence_origin_check" CHECK ("evidenceOrigin" IN ('VERSIONED_OBJECT_STORE','OFFLINE_DB_RASTER','OFFLINE_DB_VIDEO'));
ALTER TABLE "VerifiedMediaEvidence" DROP CONSTRAINT "VerifiedMediaEvidence_mime_check";
ALTER TABLE "VerifiedMediaEvidence" ADD CONSTRAINT "VerifiedMediaEvidence_mime_check" CHECK (
 ("evidenceOrigin"='OFFLINE_DB_VIDEO' AND "detectedMime"='video/webm' AND "sourceRef" LIKE 'internal:creative-source/motion/%') OR
 ("evidenceOrigin"<>'OFFLINE_DB_VIDEO' AND "detectedMime" IN ('image/png','image/jpeg','image/webp') AND "sourceRef" NOT LIKE 'internal:creative-source/motion/%'));
ALTER TABLE "VerifiedMediaEvidence" DROP CONSTRAINT "VerifiedMediaEvidence_offline_never_scanned";
ALTER TABLE "VerifiedMediaEvidence" ADD CONSTRAINT "VerifiedMediaEvidence_offline_never_scanned" CHECK ("evidenceOrigin"='VERSIONED_OBJECT_STORE' OR ("malwareScanStatus"='NOT_SCANNED' AND "scannerId" IS NULL));
CREATE FUNCTION medsol_never_approve_motion_release() RETURNS trigger LANGUAGE plpgsql AS $release$
BEGIN
 IF NEW."objectType"='CreativeAssetRevision' AND EXISTS(SELECT 1 FROM "CreativeAssetRevision" v WHERE v."organizationId"=NEW."organizationId" AND v."id"=NEW."objectId" AND v."offlineMotionVideoBase64" IS NOT NULL) THEN RAISE EXCEPTION 'Offline motion video cannot authorize publication'; END IF;
 RETURN NEW;
END;
$release$;
CREATE TRIGGER "Approval_motion_release_denied" BEFORE INSERT OR UPDATE ON "Approval" FOR EACH ROW EXECUTE FUNCTION medsol_never_approve_motion_release();
