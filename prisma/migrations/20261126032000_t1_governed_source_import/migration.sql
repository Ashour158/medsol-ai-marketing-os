ALTER TABLE "KnowledgeDocument" ADD COLUMN "governedSourceEvidence" JSONB;
ALTER TABLE "KnowledgeDocument" DROP CONSTRAINT "KnowledgeDocument_source_check";
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_source_check" CHECK (
 ("sourceType"='MANUAL' AND "governedSourceEvidence" IS NULL)
 OR ("sourceType"='GOVERNED_IMPORT' AND "expiresAt" IS NOT NULL
  AND COALESCE((jsonb_typeof("governedSourceEvidence")='object'
   AND octet_length("governedSourceEvidence"::text)<=4096
   AND "governedSourceEvidence"->>'rightsBasis' IN ('PUBLIC_DOMAIN','LICENSED_CONTENT','OWNER_PERMISSION')
   AND "governedSourceEvidence"->>'scope' IN ('METADATA_ONLY','TEXT_EXCERPT')
   AND "governedSourceEvidence"->>'permissionReference' ~ '^internal:source-rights/[A-Za-z0-9_/-]{8,180}$'
   AND "governedSourceEvidence"->>'collectionPermitted'='true'
   AND "governedSourceEvidence"->>'noPersonalData'='true'
   AND "governedSourceEvidence"->>'operatorSupplied'='true'
   AND "governedSourceEvidence"->>'actualNetworkRequests'='0'
   AND "governedSourceEvidence"->>'legalRightsVerified'='false'
   AND "governedSourceEvidence"->>'independentlyVerified'='false'
   AND "governedSourceEvidence"->>'externalEffectsAuthorized'='false'),FALSE))
);
CREATE FUNCTION medsol_governed_source_guard() RETURNS trigger LANGUAGE plpgsql AS $governed_source$
BEGIN
 IF TG_OP='INSERT' AND NEW."sourceType"='GOVERNED_IMPORT' THEN
  IF NEW."sourceUrl" IS NULL OR NEW."sourceUrl" NOT LIKE 'https://%'
   OR NEW."expiresAt"<=CURRENT_TIMESTAMP OR NEW."expiresAt">CURRENT_TIMESTAMP+interval '366 days'
   OR (NEW."governedSourceEvidence"->>'permissionExpiresAt')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."expiresAt"
   THEN RAISE EXCEPTION 'Governed import requires current bounded rights and HTTPS provenance'; END IF;
 ELSIF TG_OP='UPDATE' AND OLD."governedSourceEvidence" IS DISTINCT FROM NEW."governedSourceEvidence" THEN
  RAISE EXCEPTION 'Immutable governed source rights declaration';
 END IF;
 RETURN NEW;
END;
$governed_source$;
CREATE TRIGGER "KnowledgeDocument_governed_source_guard" BEFORE INSERT OR UPDATE ON "KnowledgeDocument"
 FOR EACH ROW EXECUTE FUNCTION medsol_governed_source_guard();
