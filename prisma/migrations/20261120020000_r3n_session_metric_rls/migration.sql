-- R3-N: harden existing IAM and performance evidence owners.
-- No extra session store, approval ledger, analytics store or tenant authority.
-- RLS is FORCE even for ordinary table owners; PostgreSQL superusers and
-- BYPASSRLS roles must be forbidden in application connection strings.
-- Every application operation must use SET LOCAL through transaction scope.
ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AuthSession_tenant_read" ON "AuthSession"
 FOR SELECT USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "AuthSession_tenant_create" ON "AuthSession"
 FOR INSERT WITH CHECK (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "AuthSession_tenant_revoke" ON "AuthSession"
 FOR UPDATE USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 ) WITH CHECK (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "AuthSession_tenant_purge" ON "AuthSession"
 FOR DELETE USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );

-- A persisted session is always bound to its original user+tenant+expiry.
-- Revoke is terminal. Historical session cleanup is tenant-scoped; no
-- unrevocation or hidden change to the OIDC identity can be performed.
CREATE FUNCTION r3n_auth_session_terminal_guard() RETURNS trigger AS $$
BEGIN
 IF OLD."id" IS DISTINCT FROM NEW."id"
 OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
 OR OLD."userId" IS DISTINCT FROM NEW."userId"
 OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
 OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
 OR OLD."revokedAt" IS NOT NULL
 OR NEW."revokedAt" IS NULL THEN
  RAISE EXCEPTION 'Auth session owner, expiry and terminal revocation are immutable'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "AuthSession_terminal_guard"
 BEFORE UPDATE ON "AuthSession"
 FOR EACH ROW EXECUTE FUNCTION r3n_auth_session_terminal_guard();

ALTER TABLE "MarketingMetricObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingMetricObservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MarketingMetricObservation_tenant_read" ON "MarketingMetricObservation"
 FOR SELECT USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "MarketingMetricObservation_tenant_create" ON "MarketingMetricObservation"
 FOR INSERT WITH CHECK (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "MarketingMetricObservation_tenant_review" ON "MarketingMetricObservation"
 FOR UPDATE USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 ) WITH CHECK (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "MarketingMetricObservation_tenant_purge" ON "MarketingMetricObservation"
 FOR DELETE USING (
  "organizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );

-- A reviewed value is source evidence, NOT verified provider billing or
-- experimental causal attribution. Only one independent human can advance
-- QUARANTINED -> REVIEWED; source facts cannot be rewritten mid-review.
CREATE FUNCTION r3n_metric_review_integrity_guard() RETURNS trigger AS $$
BEGIN
 IF OLD."id" IS DISTINCT FROM NEW."id"
 OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
 OR OLD."campaignId" IS DISTINCT FROM NEW."campaignId"
 OR OLD."sourceSystem" IS DISTINCT FROM NEW."sourceSystem"
 OR OLD."sourceRecordId" IS DISTINCT FROM NEW."sourceRecordId"
 OR OLD."metricKey" IS DISTINCT FROM NEW."metricKey"
 OR OLD."value" IS DISTINCT FROM NEW."value"
 OR OLD."observedAt" IS DISTINCT FROM NEW."observedAt"
 OR OLD."sourceReference" IS DISTINCT FROM NEW."sourceReference"
 OR OLD."submittedBy" IS DISTINCT FROM NEW."submittedBy"
 OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
 OR OLD."status"<>'QUARANTINED'
 OR NEW."status"<>'REVIEWED'
 OR NEW."reviewedBy" IS NULL
 OR NEW."reviewedBy"=OLD."submittedBy"
 OR NEW."reviewedAt" IS NULL THEN
  RAISE EXCEPTION 'Metric source facts are immutable; only independent terminal review is allowed'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "MarketingMetricObservation_terminal_review_guard"
 BEFORE UPDATE ON "MarketingMetricObservation"
 FOR EACH ROW EXECUTE FUNCTION r3n_metric_review_integrity_guard();
