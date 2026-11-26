-- One immutable experiment assignment plan per tenant fixture key. Reuse Approval.
CREATE UNIQUE INDEX "Approval_synthetic_experiment_uq" ON "Approval"("organizationId","objectId")
 WHERE "objectType"='SyntheticExperimentPlan';
CREATE FUNCTION medsol_synthetic_experiment_guard() RETURNS trigger LANGUAGE plpgsql AS $experiment_guard$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."objectType"='SyntheticExperimentPlan' THEN RAISE EXCEPTION 'Immutable synthetic experiment plan'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."objectType"='SyntheticExperimentPlan' OR NEW."objectType"='SyntheticExperimentPlan' THEN
   IF ROW(NEW."id",NEW."organizationId",NEW."objectType",NEW."objectId",NEW."requestedBy",NEW."scope",NEW."scopeDigest",
     NEW."requiredAuthority",NEW."riskLevel",NEW."scopeExpiresAt",NEW."workflowExecutionId",NEW."creativeAssetRevisionId",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."objectType",OLD."objectId",OLD."requestedBy",OLD."scope",OLD."scopeDigest",
     OLD."requiredAuthority",OLD."riskLevel",OLD."scopeExpiresAt",OLD."workflowExecutionId",OLD."creativeAssetRevisionId",OLD."createdAt")
    THEN RAISE EXCEPTION 'Immutable synthetic experiment scope'; END IF;
   IF OLD."decision"<>'PENDING' AND ROW(NEW."decision",NEW."decidedBy",NEW."decidedAt",NEW."rationale")
    IS DISTINCT FROM ROW(OLD."decision",OLD."decidedBy",OLD."decidedAt",OLD."rationale")
    THEN RAISE EXCEPTION 'Immutable synthetic experiment decision'; END IF;
  END IF;
 END IF;
 IF NEW."objectType"<>'SyntheticExperimentPlan' THEN RETURN NEW; END IF;
 IF NEW."objectId" !~ '^fixture-[A-Za-z0-9_-]{8,100}$' OR NEW."requestedBy" IS NULL
  OR NEW."requiredAuthority"<>'HUMAN_MARKETING_AUTHORITY' OR NEW."scopeExpiresAt" IS NULL
  OR NEW."workflowExecutionId" IS NOT NULL OR NEW."creativeAssetRevisionId" IS NOT NULL
  OR NEW."scopeDigest" IS NULL OR NEW."scopeDigest" !~ '^sha256:[a-f0-9]{64}$'
  OR NEW."scope" IS NULL OR jsonb_typeof(NEW."scope")<>'object'
  OR NEW."scope"->>'policy' IS DISTINCT FROM 'SYNTHETIC_EXPERIMENT_V1'
  OR NEW."scope"->>'organizationId' IS DISTINCT FROM NEW."organizationId"
  OR NEW."scope"->>'requestedBy' IS DISTINCT FROM NEW."requestedBy"
  OR NEW."scope"->'input'->>'experimentKey' IS DISTINCT FROM NEW."objectId"
  OR NEW."scope"->>'syntheticOnly' IS DISTINCT FROM 'true'
  OR NEW."scope"->>'actualExposureVerified' IS DISTINCT FROM 'false'
  OR NEW."scope"->>'externalEffectsAuthorized' IS DISTINCT FROM 'false'
  OR jsonb_typeof(NEW."scope"->'assignments') IS DISTINCT FROM 'array'
  OR jsonb_typeof(NEW."scope"->'input'->'contactIds') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid synthetic experiment scope'; END IF;
 IF jsonb_array_length(NEW."scope"->'assignments') NOT BETWEEN 4 AND 100
  OR jsonb_array_length(NEW."scope"->'assignments')<>jsonb_array_length(NEW."scope"->'input'->'contactIds')
  OR (NEW."scope"->'input'->>'endsAt')::timestamptz IS DISTINCT FROM NEW."scopeExpiresAt" AT TIME ZONE 'UTC'
 THEN RAISE EXCEPTION 'Invalid synthetic experiment cohort or window'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."decision"<>'PENDING' OR NEW."decidedBy" IS NOT NULL OR NEW."decidedAt" IS NOT NULL
   THEN RAISE EXCEPTION 'Experiment must start pending'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "MarketingConversionForm" a JOIN "MarketingConversionForm" b
   ON b."organizationId"=a."organizationId" AND b."campaignId"=a."campaignId" AND b."brandId"=a."brandId"
   WHERE a."organizationId"=NEW."organizationId" AND a."id"=NEW."scope"->'input'->>'formAId'
   AND b."id"=NEW."scope"->'input'->>'formBId' AND a."id"<>b."id"
   AND a."campaignId"=NEW."scope"->'input'->>'campaignId' AND a."brandId"=NEW."scope"->>'brandId'
   AND a."contentDigest"=NEW."scope"->>'formADigest' AND b."contentDigest"=NEW."scope"->>'formBDigest')
   THEN RAISE EXCEPTION 'Synthetic experiment form scope does not exist'; END IF;
 END IF;
 IF NEW."decision"<>'PENDING' AND (NEW."decision" NOT IN ('APPROVED','REJECTED') OR NEW."decidedBy" IS NULL
  OR NEW."decidedAt" IS NULL OR NEW."decidedBy"=NEW."requestedBy")
 THEN RAISE EXCEPTION 'Independent synthetic experiment decision required'; END IF;
 RETURN NEW;
END;
$experiment_guard$;
CREATE TRIGGER "Approval_synthetic_experiment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "Approval"
 FOR EACH ROW EXECUTE FUNCTION medsol_synthetic_experiment_guard();
