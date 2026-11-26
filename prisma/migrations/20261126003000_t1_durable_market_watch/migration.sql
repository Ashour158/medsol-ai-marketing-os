CREATE TABLE "MarketingResearchWatch" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "topic" TEXT NOT NULL,
 "sector" TEXT NOT NULL,
 "intervalHours" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdBy" TEXT NOT NULL,
 "nextDueAt" TIMESTAMP(3) NOT NULL,
 "lastEvaluatedAt" TIMESTAMP(3),
 "lastSignalIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "lastEvaluation" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "MarketingResearchWatch_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MarketingResearchWatch_bounds" CHECK (
  length("topic") BETWEEN 1 AND 180 AND length("sector") BETWEEN 1 AND 120
  AND "intervalHours" IN (24,72,168) AND "status" IN ('ACTIVE','PAUSED')
  AND "version">0 AND cardinality("lastSignalIds")<=200
  AND (("lastEvaluatedAt" IS NULL AND "lastEvaluation" IS NULL AND cardinality("lastSignalIds")=0)
   OR ("lastEvaluatedAt" IS NOT NULL AND "lastEvaluation" IS NOT NULL)))
);
CREATE UNIQUE INDEX "MarketingResearchWatch_organizationId_id_key" ON "MarketingResearchWatch"("organizationId","id");
CREATE UNIQUE INDEX "MarketingResearchWatch_organizationId_topic_sector_key" ON "MarketingResearchWatch"("organizationId","topic","sector");
CREATE INDEX "MarketingResearchWatch_due_idx" ON "MarketingResearchWatch"("organizationId","status","nextDueAt");
ALTER TABLE "MarketingResearchWatch" ADD CONSTRAINT "MarketingResearchWatch_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingResearchWatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingResearchWatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MarketingResearchWatch_tenant_select" ON "MarketingResearchWatch" FOR SELECT
 USING ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingResearchWatch_tenant_insert" ON "MarketingResearchWatch" FOR INSERT
 WITH CHECK ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingResearchWatch_tenant_update" ON "MarketingResearchWatch" FOR UPDATE
 USING ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE FUNCTION medsol_market_watch_guard() RETURNS trigger LANGUAGE plpgsql AS $market_watch$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Watch history cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."version"<>1 OR NEW."status"<>'ACTIVE' OR NEW."lastEvaluatedAt" IS NOT NULL
  THEN RAISE EXCEPTION 'New watch must start active and unevaluated'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW."id",NEW."organizationId",NEW."topic",NEW."sector",NEW."intervalHours",NEW."createdBy",NEW."createdAt")
  IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."topic",OLD."sector",OLD."intervalHours",OLD."createdBy",OLD."createdAt")
  OR NEW."version"<>OLD."version"+1
 THEN RAISE EXCEPTION 'Immutable watch configuration or revision mismatch'; END IF;
 IF NEW."status"<>OLD."status" THEN
  IF ROW(NEW."lastEvaluatedAt",NEW."lastSignalIds",NEW."lastEvaluation")
   IS DISTINCT FROM ROW(OLD."lastEvaluatedAt",OLD."lastSignalIds",OLD."lastEvaluation")
  THEN RAISE EXCEPTION 'Status change cannot rewrite evidence'; END IF;
 ELSIF OLD."status"<>'ACTIVE' OR NEW."lastEvaluatedAt" IS NULL OR NEW."lastEvaluatedAt"<OLD."nextDueAt"
  OR NEW."nextDueAt"<>NEW."lastEvaluatedAt"+make_interval(hours=>NEW."intervalHours")
  OR (OLD."lastEvaluatedAt" IS NOT NULL AND NEW."lastEvaluatedAt"<=OLD."lastEvaluatedAt")
 THEN RAISE EXCEPTION 'Watch evaluation not due or invalid schedule'; END IF;
 RETURN NEW;
END;
$market_watch$;
CREATE TRIGGER "MarketingResearchWatch_transition_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MarketingResearchWatch"
 FOR EACH ROW EXECUTE FUNCTION medsol_market_watch_guard();
