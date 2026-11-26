ALTER TABLE "CreativeAssetRevision" ADD COLUMN "offlineLayeredSpec" JSONB,
 ADD COLUMN "offlineLayeredSourceDigest" TEXT,
 ADD COLUMN "offlineLayeredParentRevisionId" TEXT;
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeRevision_layered_parent_fk"
 FOREIGN KEY ("organizationId","offlineLayeredParentRevisionId") REFERENCES "CreativeAssetRevision"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreativeAssetRevision" ADD CONSTRAINT "CreativeRevision_layered_shape" CHECK (
 ("offlineLayeredSpec" IS NULL AND "offlineLayeredSourceDigest" IS NULL AND "offlineLayeredParentRevisionId" IS NULL AND "sourceRef" NOT LIKE 'internal:creative-source/layered/%')
 OR ("offlineLayeredSpec" IS NOT NULL AND jsonb_typeof("offlineLayeredSpec")='object'
 AND octet_length("offlineLayeredSpec"::text)<=4096 AND "offlineLayeredSourceDigest" IS NOT NULL
 AND "offlineLayeredSourceDigest" ~ '^sha256:[a-f0-9]{64}$' AND "offlineLayeredParentRevisionId" IS NOT NULL
 AND "sourceKind"='EDITABLE_SOURCE' AND "sourceRef" ~ '^internal:creative-source/layered/[A-Za-z0-9_-]{12,128}$'
 AND "offlineRasterBase64" IS NULL AND "offlineEditableCopy" IS NULL)
);
CREATE FUNCTION medsol_layered_lineage_guard() RETURNS trigger LANGUAGE plpgsql AS $layered_guard$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."offlineLayeredSpec",NEW."offlineLayeredSourceDigest",NEW."offlineLayeredParentRevisionId")
    IS DISTINCT FROM ROW(OLD."offlineLayeredSpec",OLD."offlineLayeredSourceDigest",OLD."offlineLayeredParentRevisionId")
   THEN RAISE EXCEPTION 'Immutable layered design evidence'; END IF;
 ELSIF NEW."offlineLayeredSpec" IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM "CreativeAssetRevision" p WHERE p."organizationId"=NEW."organizationId"
   AND p."id"=NEW."offlineLayeredParentRevisionId" AND p."assetId"=NEW."assetId"
   AND p."version"=NEW."version"-1 AND (p."offlineRasterBase64" IS NOT NULL OR p."offlineLayeredSpec" IS NOT NULL))
   THEN RAISE EXCEPTION 'Layered parent must be prior same-asset offline revision'; END IF;
 END IF;
 RETURN NEW;
END;
$layered_guard$;
CREATE TRIGGER "CreativeRevision_layered_lineage" BEFORE INSERT OR UPDATE ON "CreativeAssetRevision"
 FOR EACH ROW EXECUTE FUNCTION medsol_layered_lineage_guard();
