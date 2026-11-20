-- R3-T: final durable OutboxEvent is tenant-owned with FORCE PostgreSQL RLS.
-- The global dispatcher must enumerate canonical Organizations and claim and
-- acknowledge/fail events within per-tenant SET LOCAL transactions.
-- A non-BYPASSRLS principal without an app.marketing_tenant_id sees no events.
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OutboxEvent_r3t_select" ON "OutboxEvent" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OutboxEvent_r3t_insert" ON "OutboxEvent" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OutboxEvent_r3t_update" ON "OutboxEvent" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policy: bounded delivery history/dead letters remain durable.
