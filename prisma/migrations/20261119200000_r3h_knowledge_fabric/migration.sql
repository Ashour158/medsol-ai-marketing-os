-- R3-H governed knowledge fabric. The existing MarketingLearningService owns curation,
-- evidence promotion and the skill-release chain; this is NOT a second agent memory.
CREATE TABLE "KnowledgeDocument" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "sourceKey" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "sourceUrl" TEXT,
 "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
 "publishedAt" TIMESTAMP(3),
 "expiresAt" TIMESTAMP(3),
 "contentDigest" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
 "accessMode" TEXT NOT NULL DEFAULT 'REVIEWERS_ONLY',
 "agentScope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "createdBy" TEXT NOT NULL,
 "reviewedBy" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "reviewReason" TEXT,
 "revokedBy" TEXT,
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "KnowledgeDocument_status_check" CHECK ("status" IN ('QUARANTINED','REVIEWED','REJECTED','REVOKED')),
 CONSTRAINT "KnowledgeDocument_access_check" CHECK (
  ("accessMode"='REVIEWERS_ONLY' AND cardinality("agentScope")=0) OR
  ("accessMode"='AGENT_SCOPED' AND cardinality("agentScope") BETWEEN 1 AND 13)
 ),
 CONSTRAINT "KnowledgeDocument_source_check" CHECK ("sourceType"='MANUAL'),
 CONSTRAINT "KnowledgeDocument_digest_check" CHECK ("contentDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "KnowledgeDocument_review_check" CHECK (
  ("status"='QUARANTINED' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL AND "revokedAt" IS NULL) OR
  ("status" IN ('REVIEWED','REJECTED') AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL
   AND "reviewedBy"<>"createdBy" AND "revokedAt" IS NULL) OR
  ("status"='REVOKED' AND "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "KnowledgeDocument_organizationId_id_key" ON "KnowledgeDocument"("organizationId","id");
CREATE UNIQUE INDEX "KnowledgeDocument_organizationId_sourceKey_key" ON "KnowledgeDocument"("organizationId","sourceKey");
CREATE INDEX "KnowledgeDocument_organizationId_status_accessMode_expiresAt_idx"
 ON "KnowledgeDocument"("organizationId","status","accessMode","expiresAt");
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "KnowledgeChunk" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "documentId" TEXT NOT NULL,
 "ordinal" INTEGER NOT NULL,
 "content" TEXT NOT NULL,
 "digest" TEXT NOT NULL,
 "terms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "vector" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[],
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "KnowledgeChunk_ordinal_check" CHECK ("ordinal" BETWEEN 0 AND 39),
 CONSTRAINT "KnowledgeChunk_digest_check" CHECK ("digest" ~ '^sha256:[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "KnowledgeChunk_organizationId_id_key" ON "KnowledgeChunk"("organizationId","id");
CREATE UNIQUE INDEX "KnowledgeChunk_organizationId_documentId_ordinal_key"
 ON "KnowledgeChunk"("organizationId","documentId","ordinal");
CREATE INDEX "KnowledgeChunk_organizationId_documentId_idx" ON "KnowledgeChunk"("organizationId","documentId");
CREATE INDEX "KnowledgeChunk_terms_gin_idx" ON "KnowledgeChunk" USING GIN ("terms");
CREATE INDEX "KnowledgeChunk_lexical_fts_idx" ON "KnowledgeChunk"
 USING GIN (to_tsvector('english', "content"));
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_organizationId_documentId_fkey"
 FOREIGN KEY ("organizationId","documentId") REFERENCES "KnowledgeDocument"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LearningSignal" ADD COLUMN "knowledgeDocumentId" TEXT;
CREATE UNIQUE INDEX "LearningSignal_organizationId_knowledgeDocumentId_key"
 ON "LearningSignal"("organizationId","knowledgeDocumentId");
ALTER TABLE "LearningSignal" ADD CONSTRAINT "LearningSignal_organizationId_knowledgeDocumentId_fkey"
 FOREIGN KEY ("organizationId","knowledgeDocumentId") REFERENCES "KnowledgeDocument"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION r3h_knowledge_document_guard() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Knowledge provenance history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'QUARANTINED' THEN
   RAISE EXCEPTION 'Evidence must begin in quarantine' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR
    OLD."sourceKey" IS DISTINCT FROM NEW."sourceKey" OR
    OLD."sourceType" IS DISTINCT FROM NEW."sourceType" OR
    OLD."contentDigest" IS DISTINCT FROM NEW."contentDigest" OR
    OLD."createdBy" IS DISTINCT FROM NEW."createdBy" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    OLD."publishedAt" IS DISTINCT FROM NEW."publishedAt" OR
    OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR
    OLD."accessMode" IS DISTINCT FROM NEW."accessMode" OR
    OLD."agentScope" IS DISTINCT FROM NEW."agentScope" OR
    OLD."status"='REVOKED' OR
    (OLD."reviewedBy" IS NOT NULL AND
     (OLD."reviewedBy" IS DISTINCT FROM NEW."reviewedBy" OR
      OLD."reviewedAt" IS DISTINCT FROM NEW."reviewedAt" OR
      OLD."reviewReason" IS DISTINCT FROM NEW."reviewReason")) THEN
  RAISE EXCEPTION 'Knowledge source metadata and attestation are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD."status"='QUARANTINED' AND NEW."status" NOT IN ('REVIEWED','REJECTED','REVOKED') THEN
  RAISE EXCEPTION 'Invalid quarantine decision' USING ERRCODE='23514';
 END IF;
 IF OLD."status" IN ('REVIEWED','REJECTED') AND NEW."status"<>'REVOKED' THEN
  RAISE EXCEPTION 'Reviewed evidence must not be silently edited' USING ERRCODE='23514';
 END IF;
 IF NEW."status" IN ('REVIEWED','REJECTED') AND
  (NEW."createdBy"=NEW."reviewedBy" OR NEW."reviewedAt" IS NULL) THEN
  RAISE EXCEPTION 'Independent evidence reviewer mandatory' USING ERRCODE='23514';
 END IF;
 IF NEW."status"='REVOKED' THEN
  IF NEW."revokedBy" IS NULL OR NEW."revokedAt" IS NULL OR
     NEW."title"<>'[REVOKED]' OR NEW."sourceUrl" IS NOT NULL THEN
   RAISE EXCEPTION 'Revocation requires metadata erasure and audit' USING ERRCODE='23514';
  END IF;
 ELSE
  IF OLD."title" IS DISTINCT FROM NEW."title" OR
     OLD."sourceUrl" IS DISTINCT FROM NEW."sourceUrl" THEN
   RAISE EXCEPTION 'Active source title and URL cannot change' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "KnowledgeDocument_immutability"
 BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeDocument"
 FOR EACH ROW EXECUTE FUNCTION r3h_knowledge_document_guard();

CREATE FUNCTION r3h_knowledge_chunk_guard() RETURNS trigger AS $$
DECLARE parent_status TEXT;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Knowledge chunk ledger cannot be deleted' USING ERRCODE='23514';
 END IF;
 SELECT "status" INTO parent_status FROM "KnowledgeDocument"
 WHERE "id"=NEW."documentId" AND "organizationId"=NEW."organizationId";
 IF TG_OP='INSERT' THEN
  IF parent_status<>'QUARANTINED' OR NEW."content"='' OR
     cardinality(NEW."vector")<>96 THEN
   RAISE EXCEPTION 'Only bounded source chunks can enter quarantine' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR
    OLD."documentId" IS DISTINCT FROM NEW."documentId" OR
    OLD."ordinal" IS DISTINCT FROM NEW."ordinal" OR
    OLD."digest" IS DISTINCT FROM NEW."digest" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    parent_status<>'REVOKED' OR NEW."content"<>'' OR
    cardinality(NEW."terms")<>0 OR cardinality(NEW."vector")<>0 THEN
  RAISE EXCEPTION 'Only scrubbing revoked source bytes is permitted' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "KnowledgeChunk_immutability"
 BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeChunk"
 FOR EACH ROW EXECUTE FUNCTION r3h_knowledge_chunk_guard();

ALTER TABLE "KnowledgeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY "KnowledgeDocument_select" ON "KnowledgeDocument" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "KnowledgeDocument_insert" ON "KnowledgeDocument" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "KnowledgeDocument_update" ON "KnowledgeDocument" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeChunk" FORCE ROW LEVEL SECURITY;
CREATE POLICY "KnowledgeChunk_select" ON "KnowledgeChunk" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "KnowledgeChunk_insert" ON "KnowledgeChunk" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "KnowledgeChunk_update" ON "KnowledgeChunk" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

-- A revoked source can never be silently resurrected.
-- Signal review and skill release continue under the existing LearningSignal
-- and AgentSkillProposal authorities, independent of this retrieval store.
