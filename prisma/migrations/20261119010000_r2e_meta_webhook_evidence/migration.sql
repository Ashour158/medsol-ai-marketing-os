-- R2E-A: provider-signed notification quarantine, not delivery confirmation.
-- Existing InboxEvent remains the event idempotency owner.
CREATE TABLE "ProviderWebhookObservation" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "integrationConnectionId" TEXT NOT NULL,
 "providerKey" TEXT NOT NULL,
 "payloadDigest" TEXT NOT NULL,
 "signatureDigest" TEXT NOT NULL,
 "rawSizeBytes" INTEGER NOT NULL,
 "eventClass" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
 "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "verifiedBy" TEXT NOT NULL,
 CONSTRAINT "ProviderWebhookObservation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProviderWebhookObs_source_check" CHECK ("providerKey"='META_GRAPH'),
 CONSTRAINT "ProviderWebhookObs_digest_check" CHECK (
  "payloadDigest" ~ '^sha256:[a-f0-9]{64}$' AND
  "signatureDigest" ~ '^sha256:[a-f0-9]{64}$'
 ),
 CONSTRAINT "ProviderWebhookObs_size_check" CHECK ("rawSizeBytes" BETWEEN 2 AND 262144),
 CONSTRAINT "ProviderWebhookObs_class_check" CHECK ("eventClass" IN ('page','instagram')),
 CONSTRAINT "ProviderWebhookObs_quarantine_check" CHECK ("status"='QUARANTINED')
);
CREATE UNIQUE INDEX "ProviderWebhookObservation_organizationId_id_key"
 ON "ProviderWebhookObservation"("organizationId","id");
CREATE UNIQUE INDEX "ProviderWebhookObs_org_conn_payload_key"
 ON "ProviderWebhookObservation"("organizationId","integrationConnectionId","payloadDigest");
CREATE INDEX "ProviderWebhookObs_org_conn_state_time_idx"
 ON "ProviderWebhookObservation"("organizationId","integrationConnectionId","status","verifiedAt");
ALTER TABLE "ProviderWebhookObservation" ADD CONSTRAINT "ProviderWebhookObservation_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderWebhookObservation" ADD CONSTRAINT "ProviderWebhookObs_org_conn_fk"
 FOREIGN KEY ("organizationId","integrationConnectionId")
 REFERENCES "IntegrationConnection"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

-- DB owner/BYPASSRLS must not rewrite or delete source observations.
CREATE FUNCTION r2e_protect_webhook_observation() RETURNS trigger AS $$
DECLARE matches integer;
BEGIN
 IF TG_OP='UPDATE' OR TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Provider webhook evidence is append-only' USING ERRCODE='23514';
 END IF;
 SELECT COUNT(*) INTO matches FROM "IntegrationConnection" conn
  WHERE conn."organizationId"=NEW."organizationId"
  AND conn."id"=NEW."integrationConnectionId"
  AND conn."providerKey"=NEW."providerKey"
  AND conn."status"='PENDING_VERIFICATION';
 IF matches<>1 THEN
  RAISE EXCEPTION 'Signed webhook evidence requires matching pending destination' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ProviderWebhookObservation_protect_evidence"
 BEFORE INSERT OR UPDATE OR DELETE ON "ProviderWebhookObservation" FOR EACH ROW
 EXECUTE FUNCTION r2e_protect_webhook_observation();

ALTER TABLE "ProviderWebhookObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderWebhookObservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ProviderWebhookObs_select_tenant" ON "ProviderWebhookObservation" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderWebhookObs_insert_tenant" ON "ProviderWebhookObservation" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ProviderWebhookObs_no_delete" ON "ProviderWebhookObservation" AS RESTRICTIVE
 FOR DELETE USING (false);
