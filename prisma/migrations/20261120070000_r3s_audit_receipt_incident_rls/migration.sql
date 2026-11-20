-- R3-S: canonical human/agent audit facts, idempotency receipts and incident response.
-- Only PostgreSQL transaction-local trusted organization context may see or create rows.
-- Separate low-privilege runtime DB role required: no owner/BYPASSRLS worker.
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AuditEvent_r3s_read" ON "AuditEvent" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AuditEvent_r3s_insert" ON "AuditEvent" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No UPDATE or DELETE grants; event facts are append-only to the application role.

ALTER TABLE "CommandReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommandReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CommandReceipt_r3s_read" ON "CommandReceipt" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "CommandReceipt_r3s_insert" ON "CommandReceipt" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- Never update or delete idempotency receipts from the application role.

ALTER TABLE "IncidentResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentResponse" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IncidentResponse_r3s_read" ON "IncidentResponse" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IncidentResponse_r3s_insert" ON "IncidentResponse" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "IncidentResponse_r3s_update" ON "IncidentResponse" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- Incident metadata can change under guarded CAS, but cannot be deleted.
