-- R3-G signed authorizations for offline-only DAG definitions.
-- All execution is written to existing WorkflowExecution and WorkflowStepExecution.
CREATE TABLE "BlueprintDeployment" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "blueprintId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL,
 "manifest" JSONB NOT NULL,
 "digest" TEXT NOT NULL,
 "signature" TEXT NOT NULL,
 "signerKeyId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PROPOSED',
 "createdBy" TEXT NOT NULL,
 "approvedBy" TEXT,
 "approvedAt" TIMESTAMP(3),
 "activatedBy" TEXT,
 "activatedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "BlueprintDeployment_revision_check" CHECK ("revision">0),
 CONSTRAINT "BlueprintDeployment_identifier_check" CHECK ("blueprintId" ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$'),
 CONSTRAINT "BlueprintDeployment_digest_check" CHECK ("digest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "BlueprintDeployment_sig_check" CHECK ("signature" ~ '^[a-zA-Z0-9_-]{80,200}$'),
 CONSTRAINT "BlueprintDeployment_state_check" CHECK ("status" IN ('PROPOSED','APPROVED','ACTIVE','SUPERSEDED','REVOKED')),
 CONSTRAINT "BlueprintDeployment_manifest_check" CHECK (
  jsonb_typeof("manifest")='object' AND
  "manifest"->'draft'->>'id'="blueprintId" AND
  ("manifest"->'draft'->>'version')::integer="revision" AND
  "manifest"->>'executionMode'='DETERMINISTIC_NO_MODEL' AND
  ("manifest"->>'canaryPercent')::integer BETWEEN 1 AND 100
 ),
 CONSTRAINT "BlueprintDeployment_maker_checker_check" CHECK (
  ("status"='PROPOSED' AND "approvedBy" IS NULL AND "approvedAt" IS NULL AND "activatedBy" IS NULL AND "activatedAt" IS NULL AND "revokedBy" IS NULL AND "revokedAt" IS NULL)
  OR ("status"<>'PROPOSED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedBy"<>"createdBy" AND
   (("status"='APPROVED' AND "revokedBy" IS NULL) OR
    ("status" IN ('ACTIVE','SUPERSEDED') AND "activatedBy" IS NOT NULL AND "activatedAt" IS NOT NULL AND "revokedBy" IS NULL AND "revokedAt" IS NULL) OR
    ("status"='REVOKED' AND "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL)))
  OR ("status"='REVOKED' AND "approvedBy" IS NULL AND "approvedAt" IS NULL AND
   "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "BlueprintDeployment_organizationId_id_key"
 ON "BlueprintDeployment"("organizationId","id");
CREATE UNIQUE INDEX "BlueprintDeployment_organizationId_blueprintId_revision_key"
 ON "BlueprintDeployment"("organizationId","blueprintId","revision");
CREATE INDEX "BlueprintDeployment_organizationId_blueprintId_status_idx"
 ON "BlueprintDeployment"("organizationId","blueprintId","status");
CREATE UNIQUE INDEX "BlueprintDeployment_one_active_per_blueprint"
 ON "BlueprintDeployment"("organizationId","blueprintId") WHERE "status"='ACTIVE';
ALTER TABLE "BlueprintDeployment" ADD CONSTRAINT "BlueprintDeployment_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION r3g_blueprint_deployment_guard() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Signed blueprint release history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'PROPOSED' OR NEW."approvedBy" IS NOT NULL THEN
   RAISE EXCEPTION 'Blueprint releases must be proposed before independent review' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR
    OLD."blueprintId" IS DISTINCT FROM NEW."blueprintId" OR
    OLD."revision" IS DISTINCT FROM NEW."revision" OR
    OLD."manifest" IS DISTINCT FROM NEW."manifest" OR
    OLD."digest" IS DISTINCT FROM NEW."digest" OR
    OLD."signature" IS DISTINCT FROM NEW."signature" OR
    OLD."signerKeyId" IS DISTINCT FROM NEW."signerKeyId" OR
    OLD."createdBy" IS DISTINCT FROM NEW."createdBy" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    OLD."status"='REVOKED' OR
    (OLD."status"='PROPOSED' AND NEW."status" NOT IN ('APPROVED','REVOKED')) OR
    (OLD."status"='APPROVED' AND NEW."status" NOT IN ('ACTIVE','REVOKED')) OR
    (OLD."status"='ACTIVE' AND NEW."status" NOT IN ('SUPERSEDED','REVOKED')) OR
    (OLD."status"='SUPERSEDED' AND NEW."status" NOT IN ('ACTIVE','REVOKED')) THEN
  RAISE EXCEPTION 'Immutable blueprint manifest or invalid release transition' USING ERRCODE='23514';
 END IF;
 IF OLD."approvedBy" IS NOT NULL AND
   (OLD."approvedBy" IS DISTINCT FROM NEW."approvedBy" OR
    OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt") THEN
  RAISE EXCEPTION 'Blueprint maker/checker decision cannot be altered' USING ERRCODE='23514';
 END IF;
 IF OLD."status"='PROPOSED' AND NEW."status"='APPROVED' AND
    NEW."createdBy"=NEW."approvedBy" THEN
  RAISE EXCEPTION 'Independent blueprint reviewer mandatory' USING ERRCODE='23514';
 END IF;
 IF OLD."status"='ACTIVE' AND NEW."status"='SUPERSEDED' AND
    (OLD."activatedBy" IS DISTINCT FROM NEW."activatedBy" OR
     OLD."activatedAt" IS DISTINCT FROM NEW."activatedAt") THEN
  RAISE EXCEPTION 'Superseding cannot rewrite previous activation evidence' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "BlueprintDeployment_guard"
 BEFORE INSERT OR UPDATE OR DELETE ON "BlueprintDeployment"
 FOR EACH ROW EXECUTE FUNCTION r3g_blueprint_deployment_guard();

ALTER TABLE "BlueprintDeployment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlueprintDeployment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BlueprintDeployment_select" ON "BlueprintDeployment"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BlueprintDeployment_insert" ON "BlueprintDeployment"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BlueprintDeployment_update" ON "BlueprintDeployment"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

-- Exactly one accepted launch claim per tenant/idempotency fence.
CREATE UNIQUE INDEX "WorkflowExecution_R3G_offline_dag_replay_key"
 ON "WorkflowExecution"("organizationId","correlationId")
 WHERE "workflowType"='BLUEPRINT_OFFLINE_DAG';
