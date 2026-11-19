-- R3-I Knowledge graph and memory are subordinate to the existing
-- MarketingLearningService / KnowledgeDocument authority. No autonomous writes.
CREATE TABLE "KnowledgeRelation" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "fromDocumentId" TEXT NOT NULL,
 "toDocumentId" TEXT NOT NULL,
 "relationType" TEXT NOT NULL,
 "note" TEXT NOT NULL,
 "noteDigest" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PROPOSED',
 "createdBy" TEXT NOT NULL,
 "reviewedBy" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "KnowledgeRelation_distinct_nodes" CHECK ("fromDocumentId"<>"toDocumentId"),
 CONSTRAINT "KnowledgeRelation_type" CHECK ("relationType" IN
  ('SHARES_TOPIC','METHODOLOGICALLY_RELATED','REPORTS_CONFLICT')),
 CONSTRAINT "KnowledgeRelation_note_digest" CHECK ("noteDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "KnowledgeRelation_state" CHECK (
  ("status"='PROPOSED' AND "reviewedBy" IS NULL AND "revokedBy" IS NULL) OR
  ("status"='REVIEWED' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL
   AND "reviewedBy"<>"createdBy" AND "revokedBy" IS NULL) OR
  ("status"='REVOKED' AND "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "KnowledgeRelation_organizationId_id_key" ON "KnowledgeRelation"("organizationId","id");
CREATE UNIQUE INDEX "KnowledgeRelation_edge_key" ON "KnowledgeRelation"("organizationId","fromDocumentId","toDocumentId","relationType");
CREATE INDEX "KnowledgeRelation_source_status_idx" ON "KnowledgeRelation"("organizationId","status","fromDocumentId");
CREATE INDEX "KnowledgeRelation_target_status_idx" ON "KnowledgeRelation"("organizationId","status","toDocumentId");
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_organizationId_fromDocumentId_fkey"
 FOREIGN KEY ("organizationId","fromDocumentId") REFERENCES "KnowledgeDocument"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_organizationId_toDocumentId_fkey"
 FOREIGN KEY ("organizationId","toDocumentId") REFERENCES "KnowledgeDocument"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AgentKnowledgeMemory" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "agentId" TEXT NOT NULL,
 "documentId" TEXT NOT NULL,
 "memoryKey" TEXT NOT NULL,
 "content" TEXT NOT NULL,
 "contentDigest" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PROPOSED',
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdBy" TEXT NOT NULL,
 "reviewedBy" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AgentKnowledgeMemory_digest" CHECK ("contentDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "AgentKnowledgeMemory_status" CHECK (
  ("status"='PROPOSED' AND "reviewedBy" IS NULL AND "revokedBy" IS NULL) OR
  ("status"='APPROVED' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL
   AND "reviewedBy"<>"createdBy" AND "revokedBy" IS NULL) OR
  ("status"='REVOKED' AND "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "AgentKnowledgeMemory_organizationId_id_key" ON "AgentKnowledgeMemory"("organizationId","id");
CREATE UNIQUE INDEX "AgentKnowledgeMemory_organizationId_agentId_memoryKey_key"
 ON "AgentKnowledgeMemory"("organizationId","agentId","memoryKey");
CREATE INDEX "AgentMemory_agent_status_expiry_idx"
 ON "AgentKnowledgeMemory"("organizationId","agentId","status","expiresAt");
CREATE INDEX "AgentMemory_source_status_idx" ON "AgentKnowledgeMemory"("organizationId","documentId","status");
ALTER TABLE "AgentKnowledgeMemory" ADD CONSTRAINT "AgentKnowledgeMemory_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentKnowledgeMemory" ADD CONSTRAINT "AgentKnowledgeMemory_organizationId_documentId_fkey"
 FOREIGN KEY ("organizationId","documentId") REFERENCES "KnowledgeDocument"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION r3i_knowledge_relation_guard() RETURNS trigger AS $$
DECLARE a_status TEXT; b_status TEXT;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Knowledge graph audit history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'PROPOSED' OR length(NEW."note")>600 OR length(NEW."note")<12 THEN
   RAISE EXCEPTION 'Knowledge relation must start as bounded proposal' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR
    OLD."fromDocumentId" IS DISTINCT FROM NEW."fromDocumentId" OR
    OLD."toDocumentId" IS DISTINCT FROM NEW."toDocumentId" OR
    OLD."relationType" IS DISTINCT FROM NEW."relationType" OR
    OLD."noteDigest" IS DISTINCT FROM NEW."noteDigest" OR
    OLD."createdBy" IS DISTINCT FROM NEW."createdBy" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    OLD."status"='REVOKED' OR
    (OLD."reviewedBy" IS NOT NULL AND
     (OLD."reviewedBy" IS DISTINCT FROM NEW."reviewedBy" OR OLD."reviewedAt" IS DISTINCT FROM NEW."reviewedAt")) THEN
  RAISE EXCEPTION 'Knowledge relation provenance cannot be altered' USING ERRCODE='23514';
 END IF;
 IF NEW."status"='REVIEWED' THEN
  IF OLD."status"<>'PROPOSED' OR NEW."reviewedBy"=NEW."createdBy" OR
     NEW."reviewedAt" IS NULL THEN
   RAISE EXCEPTION 'Independent reviewer required before graph relation use' USING ERRCODE='23514';
  END IF;
  SELECT "status" INTO a_status FROM "KnowledgeDocument"
   WHERE "id"=NEW."fromDocumentId" AND "organizationId"=NEW."organizationId";
  SELECT "status" INTO b_status FROM "KnowledgeDocument"
   WHERE "id"=NEW."toDocumentId" AND "organizationId"=NEW."organizationId";
  IF a_status<>'REVIEWED' OR b_status<>'REVIEWED' THEN
   RAISE EXCEPTION 'Both graph sources must remain reviewed' USING ERRCODE='23514';
  END IF;
 ELSIF NEW."status"='REVOKED' THEN
  IF OLD."status" NOT IN ('PROPOSED','REVIEWED') OR
     NEW."revokedBy" IS NULL OR NEW."revokedAt" IS NULL OR NEW."note"<>'' THEN
   RAISE EXCEPTION 'Revocation must scrub note text' USING ERRCODE='23514';
  END IF;
 ELSE
  RAISE EXCEPTION 'Invalid graph relation transition' USING ERRCODE='23514';
 END IF;
 IF NEW."status"<>'REVOKED' AND OLD."note" IS DISTINCT FROM NEW."note" THEN
  RAISE EXCEPTION 'Relation note is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "KnowledgeRelation_guard" BEFORE INSERT OR UPDATE OR DELETE
 ON "KnowledgeRelation" FOR EACH ROW EXECUTE FUNCTION r3i_knowledge_relation_guard();

CREATE FUNCTION r3i_agent_memory_guard() RETURNS trigger AS $$
DECLARE parent_status TEXT; parent_expiry TIMESTAMP(3); parent_scope TEXT[]; parent_mode TEXT;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Agent memory provenance cannot be deleted' USING ERRCODE='23514';
 END IF;
 SELECT "status","expiresAt","agentScope","accessMode"
  INTO parent_status,parent_expiry,parent_scope,parent_mode
  FROM "KnowledgeDocument" WHERE "organizationId"=NEW."organizationId"
   AND "id"=NEW."documentId";
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'PROPOSED' OR length(NEW."content")<24 OR length(NEW."content")>1200 OR
    NEW."expiresAt"<=CURRENT_TIMESTAMP OR NEW."expiresAt">CURRENT_TIMESTAMP+INTERVAL '30 days' OR
    parent_status<>'REVIEWED' OR parent_mode<>'AGENT_SCOPED' OR
    NOT NEW."agentId"=ANY(parent_scope) OR
    (parent_expiry IS NOT NULL AND NEW."expiresAt">parent_expiry) THEN
   RAISE EXCEPTION 'Agent memory must be TTL bound and anchored to permitted reviewed evidence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR
    OLD."agentId" IS DISTINCT FROM NEW."agentId" OR
    OLD."documentId" IS DISTINCT FROM NEW."documentId" OR
    OLD."memoryKey" IS DISTINCT FROM NEW."memoryKey" OR
    OLD."contentDigest" IS DISTINCT FROM NEW."contentDigest" OR
    OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR
    OLD."createdBy" IS DISTINCT FROM NEW."createdBy" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    OLD."status"='REVOKED' OR
    (OLD."reviewedBy" IS NOT NULL AND
     (OLD."reviewedBy" IS DISTINCT FROM NEW."reviewedBy" OR
      OLD."reviewedAt" IS DISTINCT FROM NEW."reviewedAt")) THEN
  RAISE EXCEPTION 'Memory provenance is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW."status"='APPROVED' THEN
  IF OLD."status"<>'PROPOSED' OR NEW."reviewedBy"=NEW."createdBy" OR
    NEW."reviewedAt" IS NULL OR NEW."expiresAt"<=CURRENT_TIMESTAMP OR
    parent_status<>'REVIEWED' OR parent_mode<>'AGENT_SCOPED' OR
    NOT NEW."agentId"=ANY(parent_scope) OR
    (parent_expiry IS NOT NULL AND NEW."expiresAt">parent_expiry) THEN
   RAISE EXCEPTION 'Memory approval must be independent and source-bound' USING ERRCODE='23514';
  END IF;
 ELSIF NEW."status"='REVOKED' THEN
  IF OLD."status" NOT IN ('PROPOSED','APPROVED') OR
    NEW."revokedBy" IS NULL OR NEW."revokedAt" IS NULL OR NEW."content"<>'' THEN
   RAISE EXCEPTION 'Memory revocation must scrub content' USING ERRCODE='23514';
  END IF;
 ELSE
  RAISE EXCEPTION 'Invalid agent memory lifecycle' USING ERRCODE='23514';
 END IF;
 IF NEW."status"<>'REVOKED' AND OLD."content" IS DISTINCT FROM NEW."content" THEN
  RAISE EXCEPTION 'Approved memory content cannot mutate' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "AgentKnowledgeMemory_guard" BEFORE INSERT OR UPDATE OR DELETE
 ON "AgentKnowledgeMemory" FOR EACH ROW EXECUTE FUNCTION r3i_agent_memory_guard();

ALTER TABLE "KnowledgeRelation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeRelation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "KnowledgeRelation_select" ON "KnowledgeRelation" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "KnowledgeRelation_insert" ON "KnowledgeRelation" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "KnowledgeRelation_update" ON "KnowledgeRelation" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
ALTER TABLE "AgentKnowledgeMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentKnowledgeMemory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentKnowledgeMemory_select" ON "AgentKnowledgeMemory" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentKnowledgeMemory_insert" ON "AgentKnowledgeMemory" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentKnowledgeMemory_update" ON "AgentKnowledgeMemory" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
