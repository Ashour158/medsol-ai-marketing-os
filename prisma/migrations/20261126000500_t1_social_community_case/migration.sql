-- Single offline community case state; no raw message or provider identifiers.
CREATE TABLE "SocialCommunityCase" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "brandId" TEXT NOT NULL,
 "discussionId" TEXT NOT NULL,
 "discussionDigest" TEXT NOT NULL,
 "disposition" TEXT NOT NULL,
 "escalations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "priority" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdBy" TEXT NOT NULL,
 "assignedTo" TEXT,
 "closedBy" TEXT,
 "closedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SocialCommunityCase_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SocialCommunityCase_scope_check" CHECK (
   "discussionId" ~ '^fixture-[A-Za-z0-9_-]{8,100}$'
   AND "discussionDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "SocialCommunityCase_disposition_check" CHECK (
   "disposition" IN ('INFORMATIONAL','ANSWERED','NO_RESPONSE','HUMAN_REVIEW_REQUIRED')
   AND "escalations" <@ ARRAY['SCIENTIFIC_REVIEW','BRAND_REVIEW','PRIVACY_REVIEW']::TEXT[]),
 CONSTRAINT "SocialCommunityCase_priority_check" CHECK (
   "priority" IN ('LOW','NORMAL','HIGH','URGENT')),
 CONSTRAINT "SocialCommunityCase_state_check" CHECK (
   "version" >= 1 AND (
    ("status" = 'OPEN' AND "closedBy" IS NULL AND "closedAt" IS NULL)
    OR ("status" = 'PENDING_REVIEW' AND "assignedTo" IS NOT NULL AND "closedBy" IS NULL AND "closedAt" IS NULL)
    OR ("status" = 'RESOLVED_INTERNAL' AND "assignedTo" IS NOT NULL AND "closedBy" IS NOT NULL
     AND "closedAt" IS NOT NULL AND "closedBy" <> "assignedTo" AND "closedBy" <> "createdBy")))
);
CREATE UNIQUE INDEX "SocialCommunityCase_organizationId_id_key" ON "SocialCommunityCase"("organizationId","id");
CREATE UNIQUE INDEX "SocialCommunityCase_organizationId_brandId_discussionId_key" ON "SocialCommunityCase"("organizationId","brandId","discussionId");
CREATE INDEX "SocialCommunityCase_queue_idx" ON "SocialCommunityCase"("organizationId","brandId","status","updatedAt");
ALTER TABLE "SocialCommunityCase" ADD CONSTRAINT "SocialCommunityCase_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialCommunityCase" ADD CONSTRAINT "SocialCommunityCase_organizationId_brandId_fkey"
 FOREIGN KEY ("organizationId","brandId") REFERENCES "Brand"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialCommunityCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialCommunityCase" FORCE ROW LEVEL SECURITY;
CREATE POLICY "SocialCommunityCase_tenant_select" ON "SocialCommunityCase" FOR SELECT
 USING ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "SocialCommunityCase_tenant_insert" ON "SocialCommunityCase" FOR INSERT
 WITH CHECK ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "SocialCommunityCase_tenant_update" ON "SocialCommunityCase" FOR UPDATE
 USING ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));

CREATE FUNCTION medsol_social_case_guard() RETURNS trigger LANGUAGE plpgsql AS $community_case$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Community cases cannot be deleted'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW."status" <> 'OPEN' OR NEW."version" <> 1 OR NEW."assignedTo" IS NOT NULL
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
 IF NOT (
  (OLD."status"='OPEN' AND OLD."assignedTo" IS NULL AND NEW."status"='OPEN' AND NEW."assignedTo" IS NOT NULL)
  OR (OLD."status"='OPEN' AND OLD."assignedTo" IS NOT NULL AND NEW."status"='PENDING_REVIEW'
      AND NEW."assignedTo"=OLD."assignedTo")
  OR (OLD."status"='PENDING_REVIEW' AND NEW."status"='RESOLVED_INTERNAL'
      AND NEW."assignedTo"=OLD."assignedTo")
  OR (OLD."status" IN ('PENDING_REVIEW','RESOLVED_INTERNAL') AND NEW."status"='OPEN' AND NEW."assignedTo" IS NULL)
 ) THEN RAISE EXCEPTION 'Invalid community case transition'; END IF;
 RETURN NEW;
END; $community_case$;
CREATE TRIGGER "SocialCommunityCase_transition_guard" BEFORE INSERT OR UPDATE OR DELETE ON "SocialCommunityCase"
 FOR EACH ROW EXECUTE FUNCTION medsol_social_case_guard();
