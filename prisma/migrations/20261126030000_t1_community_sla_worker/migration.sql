ALTER TABLE "SocialCommunityCase" ADD COLUMN "slaDueAt" TIMESTAMP(3), ADD COLUMN "slaEscalatedAt" TIMESTAMP(3);
CREATE INDEX "SocialCommunityCase_sla_due_idx" ON "SocialCommunityCase"("organizationId","status","slaDueAt");
CREATE OR REPLACE FUNCTION medsol_social_case_guard() RETURNS trigger LANGUAGE plpgsql AS $community_case$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Community cases cannot be deleted'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW."status" <> 'OPEN' OR NEW."version" <> 1 OR NEW."assignedTo" IS NOT NULL OR NEW."reviewRound" IS NOT NULL OR NEW."slaEscalatedAt" IS NOT NULL OR NEW."slaDueAt" IS NULL OR NEW."slaDueAt" <> NEW."createdAt"+make_interval(hours=>CASE NEW."priority" WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 4 WHEN 'NORMAL' THEN 24 ELSE 72 END)
  THEN RAISE EXCEPTION 'Community cases begin unassigned and open'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW."id",NEW."organizationId",NEW."brandId",NEW."discussionId",NEW."discussionDigest",
        NEW."disposition",NEW."escalations",NEW."priority",NEW."createdBy",NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD."id",OLD."organizationId",OLD."brandId",OLD."discussionId",OLD."discussionDigest",
        OLD."disposition",OLD."escalations",OLD."priority",OLD."createdBy",OLD."createdAt")
    OR NEW."version" <> OLD."version" + 1
 THEN RAISE EXCEPTION 'Immutable case identity or invalid revision'; END IF;
 -- System escalation does not alter review round, assignee or status.
 IF OLD."status" IN ('OPEN','PENDING_REVIEW') AND OLD."slaDueAt" IS NOT NULL
  AND OLD."slaEscalatedAt" IS NULL AND NEW."slaEscalatedAt" IS NOT NULL
  AND NEW."slaEscalatedAt">=OLD."slaDueAt" AND NEW."slaEscalatedAt"<=CURRENT_TIMESTAMP
  AND ROW(NEW."status",NEW."assignedTo",NEW."closedBy",NEW."closedAt",NEW."reviewRound",NEW."slaDueAt")
  IS NOT DISTINCT FROM ROW(OLD."status",OLD."assignedTo",OLD."closedBy",OLD."closedAt",OLD."reviewRound",OLD."slaDueAt")
 THEN RETURN NEW; END IF;
 IF OLD."status" IN ('PENDING_REVIEW','RESOLVED_INTERNAL') AND NEW."status"='OPEN' THEN
  IF NEW."slaEscalatedAt" IS NOT NULL OR NEW."slaDueAt" IS NULL
   OR NEW."slaDueAt"<>NEW."updatedAt"+make_interval(hours=>CASE NEW."priority" WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 4 WHEN 'NORMAL' THEN 24 ELSE 72 END)
  THEN RAISE EXCEPTION 'Reopened case requires new SLA window'; END IF;
 ELSIF ROW(NEW."slaDueAt",NEW."slaEscalatedAt") IS DISTINCT FROM ROW(OLD."slaDueAt",OLD."slaEscalatedAt")
 THEN RAISE EXCEPTION 'Cannot rewrite SLA deadline or escalation'; END IF;
 IF NOT (
  (OLD."status"='OPEN' AND OLD."assignedTo" IS NULL AND NEW."status"='OPEN' AND NEW."assignedTo" IS NOT NULL)
  OR (OLD."status"='OPEN' AND OLD."assignedTo" IS NOT NULL AND NEW."status"='PENDING_REVIEW'
      AND NEW."assignedTo"=OLD."assignedTo")
  OR (OLD."status"='PENDING_REVIEW' AND NEW."status"='RESOLVED_INTERNAL'
      AND NEW."assignedTo"=OLD."assignedTo")
  OR (OLD."status" IN ('PENDING_REVIEW','RESOLVED_INTERNAL') AND NEW."status"='OPEN' AND NEW."assignedTo" IS NULL)
 ) THEN RAISE EXCEPTION 'Invalid community case transition'; END IF;
 IF NEW."status"='OPEN' AND NEW."reviewRound" IS NOT NULL THEN
  RAISE EXCEPTION 'Open case cannot carry a current review round';
 END IF;
 IF NEW."status"='PENDING_REVIEW' AND NEW."reviewRound" IS DISTINCT FROM NEW."version" THEN
  RAISE EXCEPTION 'Pending case must pin exact review round';
 END IF;
 IF NEW."status"='RESOLVED_INTERNAL' THEN
  IF NEW."reviewRound" IS DISTINCT FROM OLD."reviewRound" THEN
   RAISE EXCEPTION 'Closure cannot change review round';
  END IF;
  IF cardinality(OLD."escalations")>0 AND (OLD."reviewRound" IS NULL OR EXISTS (
   SELECT 1 FROM unnest(OLD."escalations") AS requirement(kind) WHERE NOT EXISTS (
    SELECT 1 FROM "Approval" a
    WHERE a."organizationId"=OLD."organizationId" AND a."objectType"='SocialCommunityCaseSpecialist'
      AND a."objectId"=OLD."id" AND a."requiredAuthority"='HUMAN_COMMUNITY_'||requirement.kind
      AND a."scope"->>'reviewRound'=OLD."reviewRound"::text
      AND a."scope"->>'escalation'=requirement.kind AND a."scope"->>'discussionDigest'=OLD."discussionDigest"
      AND a."scope"->>'brandId'=OLD."brandId" AND a."scope"->>'caseId'=OLD."id"
      AND a."scope"->>'externalEffectsAuthorized'='false'
      AND a."decision"='APPROVED' AND a."requestedBy"=OLD."assignedTo"
      AND a."decidedBy" IS NOT NULL AND a."decidedBy"<>OLD."createdBy" AND a."decidedBy"<>OLD."assignedTo"
   ))) THEN RAISE EXCEPTION 'Required independent community reviews not satisfied'; END IF;
 END IF;
 RETURN NEW;
END; $community_case$;
