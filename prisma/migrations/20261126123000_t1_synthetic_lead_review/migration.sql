-- Reuse the canonical Approval ledger; one exact review per synthetic submission.
CREATE UNIQUE INDEX "Approval_synthetic_lead_review_uq"
 ON "Approval"("organizationId","objectId") WHERE "objectType"='SyntheticLeadQualification';

CREATE FUNCTION medsol_synthetic_lead_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $lead_guard$
DECLARE submission_actor text; submission_digest text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."objectType"='SyntheticLeadQualification' THEN RAISE EXCEPTION 'Immutable synthetic qualification review'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."objectType"='SyntheticLeadQualification' OR NEW."objectType"='SyntheticLeadQualification' THEN
   IF ROW(NEW."organizationId",NEW."objectType",NEW."objectId",NEW."requestedBy",NEW."scope",NEW."scopeDigest",
     NEW."requiredAuthority",NEW."riskLevel",NEW."workflowExecutionId",NEW."creativeAssetRevisionId",NEW."scopeExpiresAt")
     IS DISTINCT FROM ROW(OLD."organizationId",OLD."objectType",OLD."objectId",OLD."requestedBy",OLD."scope",OLD."scopeDigest",
     OLD."requiredAuthority",OLD."riskLevel",OLD."workflowExecutionId",OLD."creativeAssetRevisionId",OLD."scopeExpiresAt")
    THEN RAISE EXCEPTION 'Immutable synthetic qualification scope'; END IF;
   IF OLD."decision"<>'PENDING' AND ROW(NEW."decision",NEW."decidedBy",NEW."decidedAt",NEW."rationale")
     IS DISTINCT FROM ROW(OLD."decision",OLD."decidedBy",OLD."decidedAt",OLD."rationale")
    THEN RAISE EXCEPTION 'Immutable synthetic qualification decision'; END IF;
  END IF;
 END IF;
 IF NEW."objectType"<>'SyntheticLeadQualification' THEN RETURN NEW; END IF;
 SELECT "createdBy","payloadDigest" INTO submission_actor,submission_digest
  FROM "MarketingConversionSubmission" WHERE "organizationId"=NEW."organizationId" AND "id"=NEW."objectId";
 IF NOT FOUND OR NEW."requestedBy" IS NULL OR NEW."requiredAuthority"<>'HUMAN_MARKETING_AUTHORITY'
  OR NEW."workflowExecutionId" IS NOT NULL OR NEW."creativeAssetRevisionId" IS NOT NULL
  OR NEW."scopeDigest" IS NULL OR NEW."scopeDigest" !~ '^sha256:[a-f0-9]{64}$'
  OR NEW."scope" IS NULL OR jsonb_typeof(NEW."scope")<>'object'
  OR NEW."scope"->>'policy' IS DISTINCT FROM 'SYNTHETIC_QUALIFICATION_V1'
  OR NEW."scope"->>'organizationId' IS DISTINCT FROM NEW."organizationId"
  OR NEW."scope"->>'submissionId' IS DISTINCT FROM NEW."objectId"
  OR NEW."scope"->>'submissionDigest' IS DISTINCT FROM submission_digest
  OR NEW."scope"->>'requestedBy' IS DISTINCT FROM NEW."requestedBy"
  OR NEW."scope"->>'syntheticOnly' IS DISTINCT FROM 'true'
  OR NEW."scope"->>'realLeadVerified' IS DISTINCT FROM 'false'
  OR NEW."scope"->>'externalEffectsAuthorized' IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'Invalid synthetic qualification target and scope'; END IF;
 IF TG_OP='INSERT' AND (NEW."decision"<>'PENDING' OR NEW."decidedBy" IS NOT NULL OR NEW."decidedAt" IS NOT NULL)
 THEN RAISE EXCEPTION 'Synthetic qualification must start pending'; END IF;
 IF NEW."decision"<>'PENDING' AND (NEW."decision" NOT IN ('APPROVED','REJECTED') OR NEW."decidedBy" IS NULL
  OR NEW."decidedAt" IS NULL OR NEW."decidedBy"=NEW."requestedBy" OR NEW."decidedBy"=submission_actor)
 THEN RAISE EXCEPTION 'Independent synthetic qualification decision required'; END IF;
 RETURN NEW;
END;
$lead_guard$;
CREATE TRIGGER "Approval_synthetic_lead_guard" BEFORE INSERT OR UPDATE OR DELETE ON "Approval"
 FOR EACH ROW EXECUTE FUNCTION medsol_synthetic_lead_approval_guard();
