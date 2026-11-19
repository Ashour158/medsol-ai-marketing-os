-- R2H synthetic-only Audience & Consent / Email simulation foundations.
-- Strictly no personal email addresses, no verified consent, no ESP dispatch.
CREATE TABLE "MarketingSyntheticContact" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "brandId" TEXT NOT NULL,
 "syntheticRecipientRef" TEXT NOT NULL,
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MarketingSyntheticContact_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MarketingSyntheticContact_ref" CHECK (
  "syntheticRecipientRef" ~ '^internal:synthetic-recipient/[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "MarketingSyntheticContact_organizationId_id_key"
 ON "MarketingSyntheticContact"("organizationId","id");
CREATE UNIQUE INDEX "MarketingSyntheticContact_organizationId_brandId_syntheticRecipientRef_key"
 ON "MarketingSyntheticContact"("organizationId","brandId","syntheticRecipientRef");
CREATE INDEX "MarketingSyntheticContact_organizationId_brandId_createdAt_idx"
 ON "MarketingSyntheticContact"("organizationId","brandId","createdAt");
ALTER TABLE "MarketingSyntheticContact" ADD CONSTRAINT "MarketingSyntheticContact_org_fk"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingSyntheticContact" ADD CONSTRAINT "MarketingSyntheticContact_org_brand_fk"
 FOREIGN KEY ("organizationId","brandId") REFERENCES "Brand"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MarketingSyntheticConsent" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "contactId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "sequence" INTEGER NOT NULL,
 "evidenceRef" TEXT NOT NULL,
 "recordedBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MarketingSyntheticConsent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MarketingSyntheticConsent_action" CHECK
  ("action" IN ('SIMULATED_OPT_IN','SIMULATED_WITHDRAWAL','SIMULATED_COMPLAINT')),
 CONSTRAINT "MarketingSyntheticConsent_sequence" CHECK ("sequence">0),
 CONSTRAINT "MarketingSyntheticConsent_ref" CHECK
  ("evidenceRef" ~ '^internal:synthetic-consent/[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "MarketingSyntheticConsent_organizationId_id_key"
 ON "MarketingSyntheticConsent"("organizationId","id");
CREATE UNIQUE INDEX "MarketingSyntheticConsent_organizationId_contactId_evidenceRef_key"
 ON "MarketingSyntheticConsent"("organizationId","contactId","evidenceRef");
CREATE UNIQUE INDEX "MarketingSyntheticConsent_organizationId_contactId_sequence_key"
 ON "MarketingSyntheticConsent"("organizationId","contactId","sequence");
CREATE INDEX "MarketingSyntheticConsent_organizationId_contactId_createdAt_idx"
 ON "MarketingSyntheticConsent"("organizationId","contactId","createdAt");
ALTER TABLE "MarketingSyntheticConsent" ADD CONSTRAINT "MarketingSyntheticConsent_org_fk"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingSyntheticConsent" ADD CONSTRAINT "MarketingSyntheticConsent_org_contact_fk"
 FOREIGN KEY ("organizationId","contactId")
 REFERENCES "MarketingSyntheticContact"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MarketingEmailSimulation" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "brandId" TEXT NOT NULL,
 "campaignId" TEXT NOT NULL,
 "audienceDigest" TEXT NOT NULL,
 "contentDigest" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'SIMULATED',
 "result" JSONB NOT NULL,
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MarketingEmailSimulation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MarketingEmailSimulation_status" CHECK
  ("status" IN ('SIMULATED','BLOCKED')),
 CONSTRAINT "MarketingEmailSimulation_digests" CHECK
  ("audienceDigest" ~ '^sha256:[a-f0-9]{64}$' AND
   "contentDigest" ~ '^sha256:[a-f0-9]{64}$'),
 CONSTRAINT "MarketingEmailSimulation_no_real_send" CHECK (
  jsonb_typeof("result")='object' AND
  "result"->>'actualMessagesSent'='0' AND
  "result"->>'verifiedProviderReceipts'='0' AND
  "result"->>'externalEffectsAuthorized'='false')
);
CREATE UNIQUE INDEX "MarketingEmailSimulation_organizationId_id_key"
 ON "MarketingEmailSimulation"("organizationId","id");
CREATE UNIQUE INDEX "MarketingEmailSimulation_organizationId_requestKey_key"
 ON "MarketingEmailSimulation"("organizationId","requestKey");
CREATE INDEX "MarketingEmailSimulation_organizationId_campaignId_createdAt_idx"
 ON "MarketingEmailSimulation"("organizationId","campaignId","createdAt");
ALTER TABLE "MarketingEmailSimulation" ADD CONSTRAINT "MarketingEmailSimulation_org_fk"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingEmailSimulation" ADD CONSTRAINT "MarketingEmailSimulation_org_brand_fk"
 FOREIGN KEY ("organizationId","brandId") REFERENCES "Brand"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingEmailSimulation" ADD CONSTRAINT "MarketingEmailSimulation_org_campaign_fk"
 FOREIGN KEY ("organizationId","campaignId") REFERENCES "Campaign"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

-- A simulation cannot claim a different brand than the authoritative campaign.
CREATE FUNCTION r2h_validate_email_simulation() RETURNS trigger AS $$
DECLARE campaign_brand TEXT;
DECLARE campaign_status TEXT;
BEGIN
 SELECT "brandId","status"::text INTO campaign_brand,campaign_status
 FROM "Campaign" WHERE "organizationId"=NEW."organizationId"
  AND "id"=NEW."campaignId";
 IF NOT FOUND OR campaign_brand IS DISTINCT FROM NEW."brandId"
   OR campaign_status<>'APPROVED' THEN
  RAISE EXCEPTION 'Email simulation requires same-brand approved campaign'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "MarketingEmailSimulation_approved_campaign"
 BEFORE INSERT ON "MarketingEmailSimulation" FOR EACH ROW
 EXECUTE FUNCTION r2h_validate_email_simulation();

-- Permanent synthetic evidence, not a real consent grant.
CREATE FUNCTION r2h_synthetic_evidence_append_only() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'Synthetic audience evidence is immutable' USING ERRCODE='23514';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "MarketingSyntheticContact_append_only"
 BEFORE UPDATE OR DELETE ON "MarketingSyntheticContact"
 FOR EACH ROW EXECUTE FUNCTION r2h_synthetic_evidence_append_only();
CREATE TRIGGER "MarketingSyntheticConsent_append_only"
 BEFORE UPDATE OR DELETE ON "MarketingSyntheticConsent"
 FOR EACH ROW EXECUTE FUNCTION r2h_synthetic_evidence_append_only();
CREATE TRIGGER "MarketingEmailSimulation_append_only"
 BEFORE UPDATE OR DELETE ON "MarketingEmailSimulation"
 FOR EACH ROW EXECUTE FUNCTION r2h_synthetic_evidence_append_only();

-- Transaction-local tenant RLS for all three bounded-domain tables.
ALTER TABLE "MarketingSyntheticContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingSyntheticContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MarketingSyntheticContact_tenant_select"
 ON "MarketingSyntheticContact" FOR SELECT USING
 ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingSyntheticContact_tenant_insert"
 ON "MarketingSyntheticContact" FOR INSERT WITH CHECK
 ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

ALTER TABLE "MarketingSyntheticConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingSyntheticConsent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MarketingSyntheticConsent_tenant_select"
 ON "MarketingSyntheticConsent" FOR SELECT USING
 ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingSyntheticConsent_tenant_insert"
 ON "MarketingSyntheticConsent" FOR INSERT WITH CHECK
 ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));

ALTER TABLE "MarketingEmailSimulation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingEmailSimulation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MarketingEmailSimulation_tenant_select"
 ON "MarketingEmailSimulation" FOR SELECT USING
 ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "MarketingEmailSimulation_tenant_insert"
 ON "MarketingEmailSimulation" FOR INSERT WITH CHECK
 ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
