-- R3-T: final canonical tenant-owned outbox event authority.
-- Low-privilege runtime DB role and tenant-local transactions only, never BYPASSRLS.
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OutboxEvent_r3t_select" ON "OutboxEvent" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OutboxEvent_r3t_insert" ON "OutboxEvent" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OutboxEvent_r3t_update" ON "OutboxEvent" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policy: delivery, retries and dead letters remain durable forensic evidence.
