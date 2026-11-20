-- R3-P: FORCE RLS on six authoritative legacy tenant data domains.
-- No shadow authority; application role must not be PostgreSQL superuser or
-- BYPASSRLS. Default policy absence denies when tenant context is missing.
-- Agency SELECT of Brand-bound Campaign requires the same live CAMPAIGN_READ
-- AgencyGrant as the R3-M service, not a reusable arbitrary agency exception.
-- All writes remain owned by the client organization; no agency mutation.
ALTER TABLE "MarketingObjective" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingObjective" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MarketingObjective_tenant_select" ON "MarketingObjective"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingObjective_tenant_insert" ON "MarketingObjective"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingObjective_tenant_update" ON "MarketingObjective"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- Intentionally no DELETE policy. Lifecycle status replaces destructive deletion.

ALTER TABLE "MarketingProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingProduct" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MarketingProduct_tenant_select" ON "MarketingProduct"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingProduct_tenant_insert" ON "MarketingProduct"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingProduct_tenant_update" ON "MarketingProduct"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Campaign_owner_or_delegated_read" ON "Campaign"
 FOR SELECT USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
  OR (
   "brandId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "AgencyGrant" g
    WHERE g."clientOrganizationId"="Campaign"."organizationId"
     AND g."brandId"="Campaign"."brandId"
     AND g."agencyOrganizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
     AND g."status"='ACTIVE'
     AND g."expiresAt">CURRENT_TIMESTAMP
     AND g."actions" ? 'CAMPAIGN_READ'
   )
  )
 );
CREATE POLICY "Campaign_tenant_insert" ON "Campaign"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "Campaign_tenant_update" ON "Campaign"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

ALTER TABLE "BrandMasterRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrandMasterRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BrandMasterRevision_tenant_select" ON "BrandMasterRevision"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BrandMasterRevision_tenant_insert" ON "BrandMasterRevision"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BrandMasterRevision_tenant_update" ON "BrandMasterRevision"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

ALTER TABLE "LearningSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningSignal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "LearningSignal_tenant_select" ON "LearningSignal"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "LearningSignal_tenant_insert" ON "LearningSignal"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "LearningSignal_tenant_update" ON "LearningSignal"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

ALTER TABLE "AgentSkillProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSkillProposal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentSkillProposal_tenant_select" ON "AgentSkillProposal"
 FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentSkillProposal_tenant_insert" ON "AgentSkillProposal"
 FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentSkillProposal_tenant_update" ON "AgentSkillProposal"
 FOR UPDATE USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

-- A skill's source must be in the same tenant; source and skill authority
-- are unchanged. Fail migration if any historical cross-tenant/orphan links.
CREATE UNIQUE INDEX "LearningSignal_organizationId_id_key"
 ON "LearningSignal"("organizationId","id");
ALTER TABLE "AgentSkillProposal"
 ADD CONSTRAINT "AgentSkillProposal_organizationId_evidenceSignalId_fkey"
 FOREIGN KEY ("organizationId","evidenceSignalId")
 REFERENCES "LearningSignal"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
