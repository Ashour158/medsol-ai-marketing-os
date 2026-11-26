-- Defense in depth for the canonical approval-backed fictional points ledger.
CREATE UNIQUE INDEX "Approval_synthetic_loyalty_event_uq" ON "Approval" ("organizationId", (("scope"->'input'->>'sourceEventKey')))
 WHERE "objectType"='SyntheticLoyaltyEntry';
CREATE FUNCTION medsol_synthetic_loyalty_guard() RETURNS trigger LANGUAGE plpgsql AS $loyalty$
DECLARE points bigint; signed_points bigint; balance bigint; entries bigint; input jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."objectType"='SyntheticLoyaltyEntry' THEN RAISE EXCEPTION 'Immutable synthetic loyalty entry'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."objectType"='SyntheticLoyaltyEntry' OR NEW."objectType"='SyntheticLoyaltyEntry' THEN
   IF ROW(NEW."id",NEW."organizationId",NEW."objectType",NEW."objectId",NEW."requestedBy",NEW."scope",NEW."scopeDigest",NEW."requiredAuthority",NEW."riskLevel",NEW."scopeExpiresAt",NEW."workflowExecutionId",NEW."creativeAssetRevisionId",NEW."createdAt")
   IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."objectType",OLD."objectId",OLD."requestedBy",OLD."scope",OLD."scopeDigest",OLD."requiredAuthority",OLD."riskLevel",OLD."scopeExpiresAt",OLD."workflowExecutionId",OLD."creativeAssetRevisionId",OLD."createdAt")
   THEN RAISE EXCEPTION 'Immutable synthetic loyalty scope'; END IF;
   IF OLD."decision"<>'PENDING' AND ROW(NEW."decision",NEW."decidedBy",NEW."decidedAt",NEW."rationale")
   IS DISTINCT FROM ROW(OLD."decision",OLD."decidedBy",OLD."decidedAt",OLD."rationale")
   THEN RAISE EXCEPTION 'Immutable synthetic loyalty decision'; END IF;
  END IF;
 END IF;
 IF NEW."objectType"<>'SyntheticLoyaltyEntry' THEN RETURN NEW; END IF;
 input:=NEW."scope"->'input';
 IF NEW."scope" IS NULL OR jsonb_typeof(input) IS DISTINCT FROM 'object'
 OR NEW."requestedBy" IS NULL OR NEW."requiredAuthority"<>'HUMAN_MARKETING_AUTHORITY'
 OR NEW."scopeExpiresAt" IS NULL OR NEW."workflowExecutionId" IS NOT NULL OR NEW."creativeAssetRevisionId" IS NOT NULL
 OR NEW."scopeDigest" IS NULL OR NEW."scopeDigest" !~ '^sha256:[a-f0-9]{64}$'
 OR NEW."scope"->>'schema' IS DISTINCT FROM 'medsol.synthetic-loyalty.v1'
 OR NEW."scope"->>'organizationId' IS DISTINCT FROM NEW."organizationId"
 OR NEW."scope"->>'requestedBy' IS DISTINCT FROM NEW."requestedBy"
 OR input->>'contactId' IS DISTINCT FROM NEW."objectId"
 OR COALESCE(input->>'sourceEventKey','') !~ '^fixture-[A-Za-z0-9_-]{8,100}$'
 OR input->'fixtureOnly' IS DISTINCT FROM 'true'::jsonb
 OR NEW."scope"->'syntheticOnly' IS DISTINCT FROM 'true'::jsonb
 OR NEW."scope"->'externalEffectsAuthorized' IS DISTINCT FROM 'false'::jsonb
 OR NEW."scope"->'financialLiabilityCreated' IS DISTINCT FROM 'false'::jsonb
 OR NEW."scope"->'realPointsIssued' IS DISTINCT FROM '0'::jsonb
 OR COALESCE(input->>'kind','') NOT IN ('EARN','REDEEM')
 OR COALESCE(input->>'points','') !~ '^[1-9][0-9]{0,5}$'
 OR jsonb_typeof(input->'points') IS DISTINCT FROM 'number'
 OR jsonb_typeof(NEW."scope"->'signedPoints') IS DISTINCT FROM 'number'
 THEN RAISE EXCEPTION 'Invalid synthetic loyalty scope'; END IF;
 points:=(input->>'points')::bigint;
 signed_points:=CASE WHEN input->>'kind'='EARN' THEN points ELSE -points END;
 IF points>100000 OR NEW."scope"->'signedPoints' IS DISTINCT FROM to_jsonb(signed_points)
 OR (input->>'expiresAt')::timestamptz IS DISTINCT FROM NEW."scopeExpiresAt" AT TIME ZONE 'UTC'
 THEN RAISE EXCEPTION 'Invalid fictional point amount or expiry'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."decision"<>'PENDING' OR NEW."decidedBy" IS NOT NULL OR NEW."decidedAt" IS NOT NULL
  THEN RAISE EXCEPTION 'Synthetic loyalty entry must start pending'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "MarketingSyntheticContact" c JOIN "Campaign" p ON p."organizationId"=c."organizationId" AND p."brandId"=c."brandId"
  WHERE c."organizationId"=NEW."organizationId" AND c."id"=NEW."objectId" AND c."brandId"=input->>'brandId'
  AND p."id"=input->>'campaignId' AND p."status"='APPROVED')
  THEN RAISE EXCEPTION 'Current same-brand synthetic contact and campaign required'; END IF;
 END IF;
 IF NEW."decision"<>'PENDING' THEN
  IF NEW."decision" NOT IN ('APPROVED','REJECTED') OR NEW."decidedBy" IS NULL OR NEW."decidedAt" IS NULL OR NEW."decidedBy"=NEW."requestedBy"
  THEN RAISE EXCEPTION 'Independent synthetic loyalty decision required'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD."decision"='PENDING' AND NEW."decision"='APPROVED' THEN
  PERFORM 1 FROM "MarketingSyntheticContact" c WHERE c."organizationId"=NEW."organizationId" AND c."id"=NEW."objectId" AND c."brandId"=input->>'brandId' FOR UPDATE;
  IF NOT FOUND OR NEW."scopeExpiresAt"<=CURRENT_TIMESTAMP OR NOT EXISTS(SELECT 1 FROM "Campaign" p JOIN "Brand" b ON b."organizationId"=p."organizationId" AND b."id"=p."brandId"
   WHERE p."organizationId"=NEW."organizationId" AND p."id"=input->>'campaignId' AND p."brandId"=input->>'brandId'
   AND p."status"='APPROVED' AND b."status"='ACTIVE' AND p."version"::text=NEW."scope"->>'campaignVersion')
   THEN RAISE EXCEPTION 'Current fictional reward scope required'; END IF;
  SELECT COALESCE(sum((a."scope"->>'signedPoints')::bigint),0),count(*) INTO balance,entries FROM "Approval" a
   WHERE a."organizationId"=NEW."organizationId" AND a."objectType"='SyntheticLoyaltyEntry' AND a."objectId"=NEW."objectId" AND a."decision"='APPROVED';
  IF entries>=1000 OR balance+signed_points<0 OR balance+signed_points>10000000
   THEN RAISE EXCEPTION 'Insufficient fictional points or ledger limit reached'; END IF;
 END IF;
 RETURN NEW;
END;
$loyalty$;
CREATE TRIGGER "Approval_synthetic_loyalty_guard" BEFORE INSERT OR UPDATE OR DELETE ON "Approval" FOR EACH ROW EXECUTE FUNCTION medsol_synthetic_loyalty_guard();
