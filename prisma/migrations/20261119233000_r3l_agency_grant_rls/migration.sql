-- R3-L: one canonical AgencyGrant authority with database-enforced
-- client/agency visibility. No new identity or delegation store.
-- A client owns modifications; the agency can observe only its delegation.
-- FORCE RLS enforces the policy even under a normal table-owner connection.
ALTER TABLE "AgencyGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgencyGrant_visible_to_client_or_agency" ON "AgencyGrant"
 FOR SELECT
 USING (
  "clientOrganizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
  OR "agencyOrganizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "AgencyGrant_client_insert" ON "AgencyGrant" FOR INSERT
 WITH CHECK (
  "clientOrganizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
CREATE POLICY "AgencyGrant_client_update" ON "AgencyGrant" FOR UPDATE
 USING (
  "clientOrganizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 )
 WITH CHECK (
  "clientOrganizationId"=nullif(current_setting('app.marketing_tenant_id',true),'')
 );
-- Delete is intentionally unavailable: grant revocation is a durable,
-- audited status transition and historical grants cannot be resurrected.
CREATE FUNCTION r3l_agency_grant_lifecycle_guard() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Agency grant history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'ACTIVE' OR NEW."version"<>1 OR NEW."revokedAt" IS NOT NULL THEN
   RAISE EXCEPTION 'Agency grants must begin ACTIVE at revision one' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."clientOrganizationId" IS DISTINCT FROM NEW."clientOrganizationId" OR
    OLD."agencyOrganizationId" IS DISTINCT FROM NEW."agencyOrganizationId" OR
    OLD."brandId" IS DISTINCT FROM NEW."brandId" OR
    OLD."actions" IS DISTINCT FROM NEW."actions" OR
    OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR
    OLD."createdBy" IS DISTINCT FROM NEW."createdBy" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
    OLD."status"='REVOKED' OR
    OLD."status"<>'ACTIVE' OR NEW."status"<>'REVOKED' OR
    NEW."version"<>OLD."version"+1 OR
    NEW."revokedBy" IS NULL OR
    NEW."revokedAt" IS NULL THEN
  RAISE EXCEPTION 'Agency grants only permit terminal audited revocation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "AgencyGrant_terminal_revocation_guard"
 BEFORE INSERT OR UPDATE OR DELETE ON "AgencyGrant"
 FOR EACH ROW EXECUTE FUNCTION r3l_agency_grant_lifecycle_guard();
