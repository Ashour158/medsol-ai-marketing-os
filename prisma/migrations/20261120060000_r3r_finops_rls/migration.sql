-- R3-R FinOps: protect canonical tenant model budget and usage accounting.
-- No new ledger. Costs are bounded estimates unless independently billed.
-- The runtime role must be non-BYPASSRLS and transactions use app.marketing_tenant_id.
ALTER TABLE "ModelBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelBudget" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ModelBudget_r3r_read" ON "ModelBudget" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ModelBudget_r3r_insert" ON "ModelBudget" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ModelBudget_r3r_update" ON "ModelBudget" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policy: spending authorizations and reconciled totals cannot be erased.

ALTER TABLE "ModelUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelUsage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ModelUsage_r3r_read" ON "ModelUsage" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ModelUsage_r3r_insert" ON "ModelUsage" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ModelUsage_r3r_update" ON "ModelUsage" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policy: billing evidence and estimate history remain durable.
