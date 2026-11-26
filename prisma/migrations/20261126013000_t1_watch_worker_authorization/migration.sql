ALTER TABLE "MarketingResearchWatch" ADD COLUMN "automaticAuthorizedBy" TEXT;
CREATE OR REPLACE FUNCTION medsol_market_watch_guard() RETURNS trigger LANGUAGE plpgsql AS $market_watch$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Watch history cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."version"<>1 OR NEW."status"<>'ACTIVE' OR NEW."lastEvaluatedAt" IS NOT NULL OR NEW."automaticAuthorizedBy" IS NOT NULL
  THEN RAISE EXCEPTION 'New watch must start active and unevaluated'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW."id",NEW."organizationId",NEW."topic",NEW."sector",NEW."intervalHours",NEW."createdBy",NEW."createdAt")
  IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."topic",OLD."sector",OLD."intervalHours",OLD."createdBy",OLD."createdAt")
  OR NEW."version"<>OLD."version"+1
 THEN RAISE EXCEPTION 'Immutable watch configuration or revision mismatch'; END IF;
 IF NEW."status"<>OLD."status" OR NEW."automaticAuthorizedBy" IS DISTINCT FROM OLD."automaticAuthorizedBy" THEN
  IF ROW(NEW."lastEvaluatedAt",NEW."lastSignalIds",NEW."lastEvaluation")
   IS DISTINCT FROM ROW(OLD."lastEvaluatedAt",OLD."lastSignalIds",OLD."lastEvaluation")
  THEN RAISE EXCEPTION 'Control change cannot rewrite evidence'; END IF;
  IF NEW."automaticAuthorizedBy" IS DISTINCT FROM OLD."automaticAuthorizedBy" AND NEW."nextDueAt"<>OLD."nextDueAt" THEN RAISE EXCEPTION 'Authorization change cannot rewrite due time'; END IF;
 ELSIF OLD."status"<>'ACTIVE' OR NEW."lastEvaluatedAt" IS NULL OR NEW."lastEvaluatedAt"<OLD."nextDueAt"
  OR NEW."nextDueAt"<>NEW."lastEvaluatedAt"+make_interval(hours=>NEW."intervalHours")
  OR (OLD."lastEvaluatedAt" IS NOT NULL AND NEW."lastEvaluatedAt"<=OLD."lastEvaluatedAt")
 THEN RAISE EXCEPTION 'Watch evaluation not due or invalid schedule'; END IF;
 RETURN NEW;
END;
$market_watch$;
