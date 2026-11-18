-- R2C: one-use OAuth state and encrypted provider token material.
-- NOT a functioning provider integration: credential receipt is not proof of
-- account ownership/capability, and external publishing remains forbidden.
CREATE TABLE "OAuthAuthorizationAttempt" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "integrationConnectionId" TEXT NOT NULL,
 "providerKey" TEXT NOT NULL,
 "stateDigest" TEXT NOT NULL,
 "encryptedCodeVerifier" TEXT NOT NULL,
 "redirectUri" TEXT NOT NULL,
 "requestedScopes" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "claimedAt" TIMESTAMP(3),
 "completedAt" TIMESTAMP(3),
 CONSTRAINT "OAuthAuthorizationAttempt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "OAuthAttempt_status_allowed" CHECK ("status" IN ('PENDING','EXCHANGING','COMPLETE','FAILED')),
 CONSTRAINT "OAuthAttempt_state_digest_valid" CHECK ("stateDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "OAuthAttempt_expiry_window" CHECK ("expiresAt">"createdAt" AND "expiresAt"<="createdAt"+INTERVAL '15 minutes'),
 CONSTRAINT "OAuthAttempt_claim_consistency" CHECK (
   ("status"='PENDING' AND "claimedAt" IS NULL AND "completedAt" IS NULL) OR
   ("status"='EXCHANGING' AND "claimedAt" IS NOT NULL AND "completedAt" IS NULL) OR
   ("status" IN ('COMPLETE','FAILED') AND "claimedAt" IS NOT NULL AND "completedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "OAuthAuthorizationAttempt_organizationId_stateDigest_key"
 ON "OAuthAuthorizationAttempt"("organizationId","stateDigest");
CREATE UNIQUE INDEX "OAuthAuthorizationAttempt_organizationId_id_key"
 ON "OAuthAuthorizationAttempt"("organizationId","id");
CREATE INDEX "OAuthAuthorizationAttempt_organizationId_integrationConnectionId_status_expiresAt_idx"
 ON "OAuthAuthorizationAttempt"("organizationId","integrationConnectionId","status","expiresAt");
ALTER TABLE "OAuthAuthorizationAttempt" ADD CONSTRAINT "OAuthAuthorizationAttempt_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OAuthAuthorizationAttempt" ADD CONSTRAINT "OAuthAttempt_org_connection_fk"
 FOREIGN KEY ("organizationId","integrationConnectionId")
 REFERENCES "IntegrationConnection"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProviderCredential" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "integrationConnectionId" TEXT NOT NULL,
 "providerKey" TEXT NOT NULL,
 "encryptedAccessToken" TEXT NOT NULL,
 "encryptedRefreshToken" TEXT,
 "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
 "grantedScopes" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING_ATTESTATION',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProviderCredential_status_check" CHECK ("status" IN ('PENDING_ATTESTATION','REVOKED')),
 CONSTRAINT "ProviderCredential_version_check" CHECK ("version">0),
 CONSTRAINT "ProviderCredential_revocation_check" CHECK (
  ("status"='REVOKED' AND "revokedAt" IS NOT NULL AND "revokedBy" IS NOT NULL) OR
  ("status"='PENDING_ATTESTATION' AND "revokedAt" IS NULL AND "revokedBy" IS NULL)
 )
);
CREATE UNIQUE INDEX "ProviderCredential_organizationId_id_key"
 ON "ProviderCredential"("organizationId","id");
CREATE UNIQUE INDEX "ProviderCredential_organizationId_integrationConnectionId_key"
 ON "ProviderCredential"("organizationId","integrationConnectionId");
CREATE INDEX "ProviderCredential_organizationId_providerKey_status_idx"
 ON "ProviderCredential"("organizationId","providerKey","status");
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_org_connection_fk"
 FOREIGN KEY ("organizationId","integrationConnectionId")
 REFERENCES "IntegrationConnection"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

-- Once claimed, a one-use state may only be completed/failed; never returned
-- to PENDING. Sensitive verifier and immutable tenant/redirect never rotate in place.
CREATE FUNCTION r2c_protect_oauth_attempt() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."integrationConnectionId",NEW."providerKey",
  NEW."stateDigest",NEW."encryptedCodeVerifier",NEW."redirectUri",
  NEW."requestedScopes",NEW."createdBy",NEW."createdAt",NEW."expiresAt")
 IS DISTINCT FROM
 ROW(OLD."id",OLD."organizationId",OLD."integrationConnectionId",OLD."providerKey",
  OLD."stateDigest",OLD."encryptedCodeVerifier",OLD."redirectUri",
  OLD."requestedScopes",OLD."createdBy",OLD."createdAt",OLD."expiresAt")
 THEN RAISE EXCEPTION 'OAuth authorization provenance is immutable' USING ERRCODE='23514'; END IF;
 IF NOT (
  (OLD."status"='PENDING' AND NEW."status"='EXCHANGING') OR
  (OLD."status"='EXCHANGING' AND NEW."status" IN ('COMPLETE','FAILED')) OR
  (OLD."status"=NEW."status" AND ROW(NEW."claimedAt",NEW."completedAt") IS NOT DISTINCT FROM ROW(OLD."claimedAt",OLD."completedAt"))
 )
 THEN RAISE EXCEPTION 'OAuth state cannot be replayed or unclaimed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "OAuthAuthorizationAttempt_protect_state" BEFORE UPDATE
 ON "OAuthAuthorizationAttempt" FOR EACH ROW EXECUTE FUNCTION r2c_protect_oauth_attempt();

CREATE FUNCTION r2c_protect_provider_credential() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."id",NEW."organizationId",NEW."integrationConnectionId",
  NEW."providerKey",NEW."encryptedAccessToken",NEW."encryptedRefreshToken",
  NEW."tokenExpiresAt",NEW."grantedScopes",NEW."createdAt")
 IS DISTINCT FROM
 ROW(OLD."id",OLD."organizationId",OLD."integrationConnectionId",
  OLD."providerKey",OLD."encryptedAccessToken",OLD."encryptedRefreshToken",
  OLD."tokenExpiresAt",OLD."grantedScopes",OLD."createdAt")
 THEN RAISE EXCEPTION 'Credential provenance and ciphertext cannot be edited' USING ERRCODE='23514'; END IF;
 IF OLD."status"='REVOKED' AND NEW."status"<>'REVOKED'
 THEN RAISE EXCEPTION 'Credential revocation cannot be undone' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ProviderCredential_protect_state" BEFORE UPDATE
 ON "ProviderCredential" FOR EACH ROW EXECUTE FUNCTION r2c_protect_provider_credential();

ALTER TABLE "OAuthAuthorizationAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthAuthorizationAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OAuthAttempt_select_tenant" ON "OAuthAuthorizationAttempt" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OAuthAttempt_insert_tenant" ON "OAuthAuthorizationAttempt" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OAuthAttempt_update_tenant" ON "OAuthAuthorizationAttempt" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "OAuthAttempt_no_delete" ON "OAuthAuthorizationAttempt" AS RESTRICTIVE
 FOR DELETE USING (false);

ALTER TABLE "ProviderCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderCredential" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ProviderCredential_select_tenant" ON "ProviderCredential" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderCredential_insert_tenant" ON "ProviderCredential" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderCredential_update_tenant" ON "ProviderCredential" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderCredential_no_delete" ON "ProviderCredential" AS RESTRICTIVE
 FOR DELETE USING (false);
