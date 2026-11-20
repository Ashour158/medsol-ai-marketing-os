-- R3-Q2: close the final seven canonical tenant-row RLS boundaries.
-- Production connections are explicitly refused when SUPERUSER/BYPASSRLS.
-- Global workers enumerate Organization, then use per-tenant transactions.
-- AuditEvent and CommandReceipt are append-only for the application principal.
-- No app-level DELETE policy: retention is a separate, approved process.

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AuditEvent_r3q2_select" ON "AuditEvent"
 FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 ;
CREATE POLICY "AuditEvent_r3q2_insert" ON "AuditEvent"
 FOR INSERT
 
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));


ALTER TABLE "CommandReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommandReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CommandReceipt_r3q2_select" ON "CommandReceipt"
 FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 ;
CREATE POLICY "CommandReceipt_r3q2_insert" ON "CommandReceipt"
 FOR INSERT
 
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));


ALTER TABLE "InboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InboxEvent_r3q2_select" ON "InboxEvent"
 FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 ;
CREATE POLICY "InboxEvent_r3q2_insert" ON "InboxEvent"
 FOR INSERT
 
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "InboxEvent_r3q2_update" ON "InboxEvent"
 FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));


ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OutboxEvent_r3q2_select" ON "OutboxEvent"
 FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 ;
CREATE POLICY "OutboxEvent_r3q2_insert" ON "OutboxEvent"
 FOR INSERT
 
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OutboxEvent_r3q2_update" ON "OutboxEvent"
 FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));


ALTER TABLE "ModelBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelBudget" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ModelBudget_r3q2_select" ON "ModelBudget"
 FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 ;
CREATE POLICY "ModelBudget_r3q2_insert" ON "ModelBudget"
 FOR INSERT
 
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ModelBudget_r3q2_update" ON "ModelBudget"
 FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));


ALTER TABLE "ModelUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelUsage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ModelUsage_r3q2_select" ON "ModelUsage"
 FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 ;
CREATE POLICY "ModelUsage_r3q2_insert" ON "ModelUsage"
 FOR INSERT
 
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ModelUsage_r3q2_update" ON "ModelUsage"
 FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));


ALTER TABLE "IncidentResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentResponse" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IncidentResponse_r3q2_select" ON "IncidentResponse"
 FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 ;
CREATE POLICY "IncidentResponse_r3q2_insert" ON "IncidentResponse"
 FOR INSERT
 
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IncidentResponse_r3q2_update" ON "IncidentResponse"
 FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
