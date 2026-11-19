-- R3-E single owner for tenant-scoped MCP/A2A manifest registration.
-- Metadata only. No credentials, outbound tool calls or agent dispatch.
CREATE TABLE "GovernedToolRegistration" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "serverKey" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "manifest" JSONB NOT NULL,
 "manifestDigest" TEXT NOT NULL,
 "signature" TEXT NOT NULL,
 "signerKeyId" TEXT NOT NULL,
 "trustTier" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdBy" TEXT NOT NULL,
 "approvedBy" TEXT,
 "approvedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "GovernedToolRegistration_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "GovernedToolRegistration_kind" CHECK ("kind" IN ('MCP','A2A')),
 CONSTRAINT "GovernedToolRegistration_tier" CHECK ("trustTier" IN ('T0','T1','T2','T3')),
 CONSTRAINT "GovernedToolRegistration_status" CHECK ("status" IN ('QUARANTINED','APPROVED','REVOKED')),
 CONSTRAINT "GovernedToolRegistration_version" CHECK ("version">0),
 CONSTRAINT "GovernedToolRegistration_digest" CHECK ("manifestDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "GovernedToolRegistration_signature" CHECK ("signature" ~ '^[A-Za-z0-9_-]{80,200}$'),
 CONSTRAINT "GovernedToolRegistration_key" CHECK ("serverKey" ~ '^[a-z][a-z0-9_-]{2,79}$'),
 CONSTRAINT "GovernedToolRegistration_manifest" CHECK (
  jsonb_typeof("manifest")='object' AND
  "manifest"->>'kind'="kind" AND
  "manifest"->>'serverKey'="serverKey" AND
  "manifest"->>'trustTier'="trustTier" AND
  "manifest"->>'name'="name"
 ),
 CONSTRAINT "GovernedToolRegistration_maker_checker" CHECK (
  ("status"='QUARANTINED' AND "approvedBy" IS NULL AND "approvedAt" IS NULL AND
   "revokedBy" IS NULL AND "revokedAt" IS NULL)
  OR
  ("status"='APPROVED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL
   AND "createdBy"<>"approvedBy" AND "revokedBy" IS NULL AND "revokedAt" IS NULL)
  OR
  ("status"='REVOKED' AND "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "GovernedToolRegistration_organizationId_id_key"
 ON "GovernedToolRegistration"("organizationId","id");
CREATE UNIQUE INDEX "GovernedToolRegistration_organizationId_kind_serverKey_key"
 ON "GovernedToolRegistration"("organizationId","kind","serverKey");
CREATE INDEX "GovernedToolRegistration_organizationId_status_kind_idx"
 ON "GovernedToolRegistration"("organizationId","status","kind");
ALTER TABLE "GovernedToolRegistration" ADD CONSTRAINT "GovernedToolRegistration_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION r3e_tool_registry_guard() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Tool registry deletion prohibited' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'QUARANTINED' OR NEW."version"<>1 THEN
   RAISE EXCEPTION 'Tool registration must start quarantined' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR
    OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."kind" IS DISTINCT FROM NEW."kind" OR
    OLD."serverKey" IS DISTINCT FROM NEW."serverKey" OR
    OLD."name" IS DISTINCT FROM NEW."name" OR
    OLD."manifest" IS DISTINCT FROM NEW."manifest" OR
    OLD."manifestDigest" IS DISTINCT FROM NEW."manifestDigest" OR
    OLD."signature" IS DISTINCT FROM NEW."signature" OR
    OLD."signerKeyId" IS DISTINCT FROM NEW."signerKeyId" OR
    OLD."trustTier" IS DISTINCT FROM NEW."trustTier" OR
    OLD."createdBy" IS DISTINCT FROM NEW."createdBy" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    NEW."version"<>OLD."version"+1 OR
    (OLD."status"='REVOKED') OR
    (OLD."status"='APPROVED' AND NEW."status"<>'REVOKED') OR
    (OLD."status"='QUARANTINED' AND NEW."status" NOT IN ('APPROVED','REVOKED')) THEN
  RAISE EXCEPTION 'Immutable tool manifest or invalid transition' USING ERRCODE='23514';
 END IF;
 IF OLD."status"='APPROVED' AND
  (OLD."approvedBy" IS DISTINCT FROM NEW."approvedBy" OR
   OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt") THEN
  RAISE EXCEPTION 'Tool approval history is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "GovernedToolRegistration_guard"
 BEFORE INSERT OR UPDATE OR DELETE ON "GovernedToolRegistration"
 FOR EACH ROW EXECUTE FUNCTION r3e_tool_registry_guard();

ALTER TABLE "GovernedToolRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GovernedToolRegistration" FORCE ROW LEVEL SECURITY;
CREATE POLICY "GovernedToolRegistration_select" ON "GovernedToolRegistration"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "GovernedToolRegistration_insert" ON "GovernedToolRegistration"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "GovernedToolRegistration_update" ON "GovernedToolRegistration"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
