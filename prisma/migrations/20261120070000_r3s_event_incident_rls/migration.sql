-- R3-S: canonical audit, command, inbox and incident record tenant isolation.
-- Only transaction-local app.marketing_tenant_id; no production bypass principal.
-- Do not mutate or delete historical audit and command evidence.

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AuditEvent_r3s_select" ON "AuditEvent" FOR SELECT
  USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AuditEvent_r3s_insert" ON "AuditEvent" FOR INSERT
  WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE grant; audit and receipt are also deliberately non-updatable.

ALTER TABLE "CommandReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommandReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CommandReceipt_r3s_select" ON "CommandReceipt" FOR SELECT
  USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CommandReceipt_r3s_insert" ON "CommandReceipt" FOR INSERT
  WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE grant; audit and receipt are also deliberately non-updatable.

ALTER TABLE "InboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InboxEvent_r3s_select" ON "InboxEvent" FOR SELECT
  USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "InboxEvent_r3s_insert" ON "InboxEvent" FOR INSERT
  WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "InboxEvent_r3s_update" ON "InboxEvent" FOR UPDATE
  USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE grant; audit and receipt are also deliberately non-updatable.

ALTER TABLE "IncidentResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentResponse" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IncidentResponse_r3s_select" ON "IncidentResponse" FOR SELECT
  USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IncidentResponse_r3s_insert" ON "IncidentResponse" FOR INSERT
  WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IncidentResponse_r3s_update" ON "IncidentResponse" FOR UPDATE
  USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE grant; audit and receipt are also deliberately non-updatable.
