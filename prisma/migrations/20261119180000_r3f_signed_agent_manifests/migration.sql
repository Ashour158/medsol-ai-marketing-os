-- R3-F additive, tenant-isolated signed release history owned by canonical Agent.
-- APPROVED still does not mean provider/tool/model network authorization.
CREATE TABLE "AgentManifestRevision" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "agentId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL,
 "manifest" JSONB NOT NULL,
 "digest" TEXT NOT NULL,
 "signature" TEXT NOT NULL,
 "signerKeyId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PROPOSED',
 "createdBy" TEXT NOT NULL,
 "approvedBy" TEXT,
 "approvedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AgentManifestRevision_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AgentManifestRevision_rev" CHECK ("revision">1),
 CONSTRAINT "AgentManifestRevision_digest" CHECK ("digest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "AgentManifestRevision_signature" CHECK ("signature" ~ '^[A-Za-z0-9_-]{80,200}$'),
 CONSTRAINT "AgentManifestRevision_status" CHECK ("status" IN ('PROPOSED','APPROVED','REVOKED')),
 CONSTRAINT "AgentManifestRevision_lifecycle" CHECK (
  ("status"='PROPOSED' AND "approvedBy" IS NULL AND "approvedAt" IS NULL AND
   "revokedBy" IS NULL AND "revokedAt" IS NULL)
  OR ("status"='APPROVED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL AND
   "approvedBy"<>"createdBy" AND "revokedBy" IS NULL AND "revokedAt" IS NULL)
  OR ("status"='REVOKED' AND "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL AND
    (("approvedBy" IS NULL AND "approvedAt" IS NULL) OR
     ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL AND
      "approvedBy"<>"createdBy")))
 ),
 CONSTRAINT "AgentManifestRevision_manifest" CHECK (
  jsonb_typeof("manifest")='object' AND
  "manifest"->>'agentId'="agentId" AND
  jsonb_typeof("manifest"->'capabilities')='array'
 )
);
CREATE UNIQUE INDEX "AgentManifestRevision_organizationId_id_key"
 ON "AgentManifestRevision"("organizationId","id");
CREATE UNIQUE INDEX "AgentManifestRevision_organizationId_agentId_revision_key"
 ON "AgentManifestRevision"("organizationId","agentId","revision");
CREATE INDEX "AgentManifestRevision_organizationId_agentId_status_idx"
 ON "AgentManifestRevision"("organizationId","agentId","status");
ALTER TABLE "AgentManifestRevision" ADD CONSTRAINT "AgentManifestRevision_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentManifestRevision" ADD CONSTRAINT "AgentManifestRevision_organizationId_agentId_fkey"
 FOREIGN KEY ("organizationId","agentId") REFERENCES "Agent"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION r3f_agent_manifest_revision_guard() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Agent release history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'PROPOSED' OR NEW."revision"<2 THEN
   RAISE EXCEPTION 'Agent release must start proposed at revision 2+' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR
    OLD."agentId" IS DISTINCT FROM NEW."agentId" OR
    OLD."revision" IS DISTINCT FROM NEW."revision" OR
    OLD."manifest" IS DISTINCT FROM NEW."manifest" OR
    OLD."digest" IS DISTINCT FROM NEW."digest" OR
    OLD."signature" IS DISTINCT FROM NEW."signature" OR
    OLD."signerKeyId" IS DISTINCT FROM NEW."signerKeyId" OR
    OLD."createdBy" IS DISTINCT FROM NEW."createdBy" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    OLD."status"='REVOKED' OR
    (OLD."status"='PROPOSED' AND NEW."status" NOT IN ('APPROVED','REVOKED')) OR
    (OLD."status"='APPROVED' AND NEW."status"<>'REVOKED') THEN
  RAISE EXCEPTION 'Immutable agent release or invalid state transition' USING ERRCODE='23514';
 END IF;
 IF OLD."status"='APPROVED' AND
  (OLD."approvedBy" IS DISTINCT FROM NEW."approvedBy" OR
   OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt") THEN
  RAISE EXCEPTION 'Agent release approval history immutable' USING ERRCODE='23514';
 END IF;
 IF OLD."status"='PROPOSED' AND
  (NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy" OR
   NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt") AND
   NEW."status"<>'APPROVED' THEN
  RAISE EXCEPTION 'Invalid agent review transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "AgentManifestRevision_guard"
 BEFORE INSERT OR UPDATE OR DELETE ON "AgentManifestRevision"
 FOR EACH ROW EXECUTE FUNCTION r3f_agent_manifest_revision_guard();

-- Database verifies any non-baseline active version has an approved,
-- nonrevoked signed-manifest record and exact restrictive capabilities.
CREATE FUNCTION r3f_agent_active_revision_guard() RETURNS trigger AS $$
BEGIN
 IF NEW."version"<>OLD."version" AND NEW."version">1 THEN
  IF NOT EXISTS(
   SELECT 1 FROM "AgentManifestRevision" r WHERE
    r."organizationId"=NEW."organizationId" AND
    r."agentId"=NEW."id" AND
    r."revision"=NEW."version" AND
    r."status"='APPROVED' AND
    r."manifest"->'capabilities'=NEW."capabilities" AND
    r."manifest"->>'name'=NEW."name"
  ) THEN
   RAISE EXCEPTION 'Active agent version requires approved matching release'
    USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "Agent_active_revision_guard"
 BEFORE UPDATE ON "Agent" FOR EACH ROW
 EXECUTE FUNCTION r3f_agent_active_revision_guard();

ALTER TABLE "AgentManifestRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentManifestRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentManifestRevision_select" ON "AgentManifestRevision"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentManifestRevision_insert" ON "AgentManifestRevision"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentManifestRevision_update" ON "AgentManifestRevision"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
