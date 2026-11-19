-- R3-M: retain existing sources of truth. Enforce tenant correctness at
-- the PostgreSQL boundary, including when application-side filters are missed.
-- Existing nonmatching historical relationships fail migration validation:
-- never silently rewrite foreign-tenant business references.
CREATE UNIQUE INDEX "MarketingObjective_organizationId_id_key"
 ON "MarketingObjective"("organizationId","id");
CREATE UNIQUE INDEX "MarketingProduct_organizationId_id_key"
 ON "MarketingProduct"("organizationId","id");
CREATE UNIQUE INDEX "WorkflowExecution_organizationId_id_key"
 ON "WorkflowExecution"("organizationId","id");
CREATE UNIQUE INDEX "BrainRun_organizationId_id_key"
 ON "BrainRun"("organizationId","id");

ALTER TABLE "Campaign"
 DROP CONSTRAINT "Campaign_objectiveId_fkey";
ALTER TABLE "Campaign"
 ADD CONSTRAINT "Campaign_organizationId_objectiveId_fkey"
 FOREIGN KEY ("organizationId","objectiveId")
 REFERENCES "MarketingObjective"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign"
 DROP CONSTRAINT "Campaign_productId_fkey";
ALTER TABLE "Campaign"
 ADD CONSTRAINT "Campaign_organizationId_productId_fkey"
 FOREIGN KEY ("organizationId","productId")
 REFERENCES "MarketingProduct"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Approval"
 DROP CONSTRAINT "Approval_workflowExecutionId_fkey";
ALTER TABLE "Approval"
 ADD CONSTRAINT "Approval_organizationId_workflowExecutionId_fkey"
 FOREIGN KEY ("organizationId","workflowExecutionId")
 REFERENCES "WorkflowExecution"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowStepExecution"
 DROP CONSTRAINT "WorkflowStepExecution_workflowExecutionId_fkey";
ALTER TABLE "WorkflowStepExecution"
 ADD CONSTRAINT "WorkflowStepExecution_organizationId_workflowExecutionId_fkey"
 FOREIGN KEY ("organizationId","workflowExecutionId")
 REFERENCES "WorkflowExecution"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrainRunStep"
 DROP CONSTRAINT "BrainRunStep_runId_fkey";
ALTER TABLE "BrainRunStep"
 ADD CONSTRAINT "BrainRunStep_organizationId_runId_fkey"
 FOREIGN KEY ("organizationId","runId")
 REFERENCES "BrainRun"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the authoritative Brand table. Delegation remains stored EXCLUSIVELY
-- in AgencyGrant; this creates no second brand, membership or policy owner.
-- A low-privilege agency may inspect ONLY an active, nonexpired, explicitly
-- scoped client Brand for a currently granted non-effectful action.
-- Grant visibility itself is already FORCE RLS-protected by R3-L.
ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brand" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Brand_owner_or_delegated_select" ON "Brand"
 FOR SELECT USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
  OR EXISTS (
   SELECT 1 FROM "AgencyGrant" g
   WHERE g."clientOrganizationId"="Brand"."organizationId"
    AND g."brandId"="Brand"."id"
    AND g."agencyOrganizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
    AND g."status"='ACTIVE'
    AND g."expiresAt">CURRENT_TIMESTAMP
    AND g."actions" ?| ARRAY['CAMPAIGN_READ','ASSET_DRAFT','REVIEW_COMMENT','REPORT_READ']
  )
 );
CREATE POLICY "Brand_tenant_insert" ON "Brand" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "Brand_tenant_update" ON "Brand" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "Brand_tenant_delete" ON "Brand" FOR DELETE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
