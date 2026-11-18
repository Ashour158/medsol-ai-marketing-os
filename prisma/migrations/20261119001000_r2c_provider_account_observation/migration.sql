-- R2C-C: append-once, tenant-bound provider account observation.
-- This is NOT destination ownership verification, legal consent, or publication authority.
CREATE TABLE "ProviderAccountObservation" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "integrationConnectionId" TEXT NOT NULL,
 "providerCredentialId" TEXT NOT NULL,
 "providerKey" TEXT NOT NULL,
 "providerAccountRef" TEXT NOT NULL,
 "observedScopes" JSONB NOT NULL,
 "observedCapabilities" JSONB NOT NULL,
 "sourceRequestId" TEXT NOT NULL,
 "evidenceDigest" TEXT NOT NULL,
 "observedBy" TEXT NOT NULL,
 "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OBSERVED',
 "revokedAt" TIMESTAMP(3),
 "revokedBy" TEXT,
 CONSTRAINT "ProviderAccountObservation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProviderAccountObs_state_check" CHECK ("status" IN ('OBSERVED','REVOKED')),
 CONSTRAINT "ProviderAccountObs_revoked_consistency" CHECK (
   ("status"='OBSERVED' AND "revokedAt" IS NULL AND "revokedBy" IS NULL) OR
   ("status"='REVOKED' AND "revokedAt" IS NOT NULL AND "revokedBy" IS NOT NULL)
 ),
 CONSTRAINT "ProviderAccountObs_expiry_check" CHECK (
   "expiresAt">"observedAt" AND "expiresAt"<="observedAt"+INTERVAL '15 minutes'
 ),
 CONSTRAINT "ProviderAccountObs_digest_check" CHECK ("evidenceDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "ProviderAccountObs_ref_check" CHECK (
    length("providerAccountRef") BETWEEN 3 AND 128 AND
    "providerAccountRef" ~ '^[A-Za-z0-9_:.\\-]+$'
 ),
 CONSTRAINT "ProviderAccountObs_scopes_check" CHECK (
   jsonb_typeof("observedScopes")='array' AND
   jsonb_typeof("observedCapabilities")='array'
 )
);
CREATE UNIQUE INDEX "ProviderAccountObservation_organizationId_id_key"
 ON "ProviderAccountObservation"("organizationId","id");
CREATE UNIQUE INDEX "ProviderAccountObs_org_credential_key"
 ON "ProviderAccountObservation"("organizationId","providerCredentialId");
CREATE INDEX "ProviderAccountObs_org_conn_state_exp_idx"
 ON "ProviderAccountObservation"("organizationId","integrationConnectionId","status","expiresAt");
ALTER TABLE "ProviderAccountObservation" ADD CONSTRAINT "ProviderAccountObservation_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderAccountObservation" ADD CONSTRAINT "ProviderAccountObs_org_conn_fk"
 FOREIGN KEY ("organizationId","integrationConnectionId")
 REFERENCES "IntegrationConnection"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderAccountObservation" ADD CONSTRAINT "ProviderAccountObs_org_cred_fk"
 FOREIGN KEY ("organizationId","providerCredentialId")
 REFERENCES "ProviderCredential"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database provenance fence: an observation must attach to exactly the same
-- tenant, provider and connection as the received unrevoked credential.
CREATE FUNCTION r2c_protect_account_observation() RETURNS trigger AS $$
DECLARE matches integer;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT COUNT(*) INTO matches FROM "ProviderCredential" cred
   JOIN "IntegrationConnection" conn
    ON conn."organizationId"=cred."organizationId"
    AND conn."id"=cred."integrationConnectionId"
   WHERE cred."id"=NEW."providerCredentialId"
    AND cred."organizationId"=NEW."organizationId"
    AND cred."integrationConnectionId"=NEW."integrationConnectionId"
    AND cred."providerKey"=NEW."providerKey"
    AND cred."status"='PENDING_ATTESTATION'
    AND cred."tokenExpiresAt">CURRENT_TIMESTAMP
    AND conn."status"='PENDING_VERIFICATION'
    AND conn."providerKey"=NEW."providerKey";
  IF matches<>1 THEN
   RAISE EXCEPTION 'Provider observation requires exact active tenant credential and connection' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW."id",NEW."organizationId",NEW."integrationConnectionId",
    NEW."providerCredentialId",NEW."providerKey",NEW."providerAccountRef",
    NEW."observedScopes",NEW."observedCapabilities",NEW."sourceRequestId",
    NEW."evidenceDigest",NEW."observedBy",NEW."observedAt",NEW."expiresAt")
  IS DISTINCT FROM
   ROW(OLD."id",OLD."organizationId",OLD."integrationConnectionId",
    OLD."providerCredentialId",OLD."providerKey",OLD."providerAccountRef",
    OLD."observedScopes",OLD."observedCapabilities",OLD."sourceRequestId",
    OLD."evidenceDigest",OLD."observedBy",OLD."observedAt",OLD."expiresAt")
 THEN
  RAISE EXCEPTION 'Provider account observation provenance is immutable' USING ERRCODE='23514';
 END IF;
 IF NOT (
  (OLD."status"='OBSERVED' AND NEW."status"='REVOKED') OR
  (OLD."status"=NEW."status" AND
    ROW(NEW."revokedAt",NEW."revokedBy") IS NOT DISTINCT FROM
    ROW(OLD."revokedAt",OLD."revokedBy"))
 ) THEN
  RAISE EXCEPTION 'Provider account observation revocation is irreversible' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ProviderAccountObservation_protect_provenance"
 BEFORE INSERT OR UPDATE ON "ProviderAccountObservation"
 FOR EACH ROW EXECUTE FUNCTION r2c_protect_account_observation();

ALTER TABLE "ProviderAccountObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderAccountObservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ProviderAccountObs_select_tenant" ON "ProviderAccountObservation" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderAccountObs_insert_tenant" ON "ProviderAccountObservation" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderAccountObs_update_tenant" ON "ProviderAccountObservation" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderAccountObs_no_delete" ON "ProviderAccountObservation" AS RESTRICTIVE
 FOR DELETE USING (false);
