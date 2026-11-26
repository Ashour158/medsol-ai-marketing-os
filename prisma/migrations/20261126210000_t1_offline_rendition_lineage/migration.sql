-- Immutable offline raster lineage; no remote release rights.
ALTER TABLE "CreativeAssetRevision" ADD COLUMN "offlineRenditionParentRevisionId" TEXT, ADD COLUMN "offlineRenditionSourceDigest" TEXT;
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeRevision_rendition_parent_fk" FOREIGN KEY ("organizationId","offlineRenditionParentRevisionId") REFERENCES "CreativeAssetRevision"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeRevision_rendition_shape" CHECK (
 ("offlineRenditionParentRevisionId" IS NULL AND "offlineRenditionSourceDigest" IS NULL) OR
 ("offlineRenditionParentRevisionId" IS NOT NULL AND "offlineRenditionSourceDigest" IS NOT NULL AND "offlineRenditionSourceDigest" ~ '^sha256:[a-f0-9]{64}$' AND "offlineRasterBase64" IS NOT NULL AND "offlineLayeredSpec" IS NULL AND "sourceKind"='FLATTENED_EXPORT'));
CREATE FUNCTION medsol_rendition_lineage_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."offlineRenditionParentRevisionId",NEW."offlineRenditionSourceDigest") IS DISTINCT FROM ROW(OLD."offlineRenditionParentRevisionId",OLD."offlineRenditionSourceDigest") THEN RAISE EXCEPTION 'Immutable rendition lineage'; END IF;
 ELSIF NEW."offlineRenditionParentRevisionId" IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM "CreativeAssetRevision" p WHERE p."organizationId"=NEW."organizationId" AND p."assetId"=NEW."assetId" AND p."id"=NEW."offlineRenditionParentRevisionId" AND p."version"=NEW."version"-1 AND p."offlineLayeredSpec" IS NOT NULL AND p."offlineLayeredSourceDigest"=NEW."offlineRenditionSourceDigest") THEN RAISE EXCEPTION 'Exact layered rendition parent required'; END IF;
 END IF;
 RETURN NEW;
END;
$guard$;
CREATE TRIGGER "CreativeRevision_rendition_lineage" BEFORE INSERT OR UPDATE ON "CreativeAssetRevision" FOR EACH ROW EXECUTE FUNCTION medsol_rendition_lineage_guard();
