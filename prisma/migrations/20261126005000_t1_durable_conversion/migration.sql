-- Immutable form revision and synthetic-only submission. No actual lead/CRM write.
CREATE TABLE "MarketingConversionForm" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "campaignId" TEXT NOT NULL,
 "brandId" TEXT NOT NULL, "campaignVersion" INTEGER NOT NULL, "formKey" TEXT NOT NULL,
 "headline" TEXT NOT NULL, "cta" TEXT NOT NULL, "contentDigest" TEXT NOT NULL,
 "approvalId" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MarketingConversionForm_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ConversionForm_bounds" CHECK ("campaignVersion">0 AND
 "formKey" ~ '^fixture-[A-Za-z0-9_-]{8,100}$' AND length("headline") BETWEEN 1 AND 120
 AND length("cta") BETWEEN 1 AND 80 AND "contentDigest" ~ '^sha256:[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "MarketingConversionForm_organizationId_id_key" ON "MarketingConversionForm"("organizationId","id");
CREATE UNIQUE INDEX "MarketingConversionForm_organizationId_formKey_key" ON "MarketingConversionForm"("organizationId","formKey");
CREATE INDEX "ConversionForm_campaign_idx" ON "MarketingConversionForm"("organizationId","campaignId","createdAt");
ALTER TABLE "MarketingConversionForm" ADD CONSTRAINT "MarketingConversionForm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingConversionForm" ADD CONSTRAINT "MarketingConversionForm_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId","campaignId") REFERENCES "Campaign"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingConversionForm" ADD CONSTRAINT "MarketingConversionForm_organizationId_brandId_fkey" FOREIGN KEY ("organizationId","brandId") REFERENCES "Brand"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingConversionForm" ADD CONSTRAINT "MarketingConversionForm_organizationId_approvalId_fkey" FOREIGN KEY ("organizationId","approvalId") REFERENCES "Approval"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "MarketingConversionSubmission" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "formId" TEXT NOT NULL,
 "contactId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "consentEventId" TEXT NOT NULL,
 "payloadDigest" TEXT NOT NULL, "outcome" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MarketingConversionSubmission_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ConversionSubmission_bounds" CHECK ("requestKey" ~ '^fixture-[A-Za-z0-9_-]{8,100}$'
 AND "payloadDigest" ~ '^sha256:[a-f0-9]{64}$' AND "outcome" IN ('MOCK_ACCEPTED','MOCK_REJECTED','OUTCOME_UNKNOWN'))
);
CREATE UNIQUE INDEX "MarketingConversionSubmission_organizationId_id_key" ON "MarketingConversionSubmission"("organizationId","id");
CREATE UNIQUE INDEX "MarketingConversionSubmission_organizationId_requestKey_key" ON "MarketingConversionSubmission"("organizationId","requestKey");
CREATE UNIQUE INDEX "ConversionSubmission_form_contact_uq" ON "MarketingConversionSubmission"("organizationId","formId","contactId");
CREATE INDEX "ConversionSubmission_form_idx" ON "MarketingConversionSubmission"("organizationId","formId","createdAt");
ALTER TABLE "MarketingConversionSubmission" ADD CONSTRAINT "MarketingConversionSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingConversionSubmission" ADD CONSTRAINT "MarketingConversionSubmission_organizationId_formId_fkey" FOREIGN KEY ("organizationId","formId") REFERENCES "MarketingConversionForm"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingConversionSubmission" ADD CONSTRAINT "MarketingConversionSubmission_organizationId_contactId_fkey" FOREIGN KEY ("organizationId","contactId") REFERENCES "MarketingSyntheticContact"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingConversionSubmission" ADD CONSTRAINT "ConversionSubmission_org_consent_fk" FOREIGN KEY ("organizationId","consentEventId") REFERENCES "MarketingSyntheticConsent"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingConversionForm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingConversionForm" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MarketingConversionSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingConversionSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ConversionForm_select" ON "MarketingConversionForm" FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ConversionForm_insert" ON "MarketingConversionForm" FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ConversionSubmission_select" ON "MarketingConversionSubmission" FOR SELECT USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "ConversionSubmission_insert" ON "MarketingConversionSubmission" FOR INSERT WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE FUNCTION medsol_conversion_immutable() RETURNS trigger LANGUAGE plpgsql AS $conversion_immutable$
BEGIN
 RAISE EXCEPTION 'Conversion form and submission evidence is immutable';
END;
$conversion_immutable$;
CREATE TRIGGER "ConversionForm_immutable" BEFORE UPDATE OR DELETE ON "MarketingConversionForm" FOR EACH ROW EXECUTE FUNCTION medsol_conversion_immutable();
CREATE TRIGGER "ConversionSubmission_immutable" BEFORE UPDATE OR DELETE ON "MarketingConversionSubmission" FOR EACH ROW EXECUTE FUNCTION medsol_conversion_immutable();
CREATE FUNCTION medsol_conversion_form_guard() RETURNS trigger LANGUAGE plpgsql AS $conversion_form$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Campaign" c JOIN "Brand" b ON b."organizationId"=c."organizationId" AND b."id"=c."brandId"
 WHERE c."organizationId"=NEW."organizationId" AND c."id"=NEW."campaignId" AND c."brandId"=NEW."brandId"
 AND c."version"=NEW."campaignVersion" AND c."status"='APPROVED' AND b."status"='ACTIVE')
 OR NOT EXISTS (SELECT 1 FROM "Approval" a WHERE a."organizationId"=NEW."organizationId" AND a."id"=NEW."approvalId"
 AND a."objectType"='MarketingConversionForm' AND a."objectId"=NEW."id" AND a."scopeDigest"=NEW."contentDigest"
 AND a."requestedBy"=NEW."createdBy" AND a."decision"='PENDING')
 THEN RAISE EXCEPTION 'Form requires current campaign and exact pending review'; END IF;
 RETURN NEW;
END;
$conversion_form$;
CREATE TRIGGER "ConversionForm_scope" BEFORE INSERT ON "MarketingConversionForm" FOR EACH ROW EXECUTE FUNCTION medsol_conversion_form_guard();
CREATE FUNCTION medsol_conversion_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $conversion_submission$
BEGIN
 IF NOT EXISTS (
 SELECT 1 FROM "MarketingConversionForm" f JOIN "Campaign" c ON c."organizationId"=f."organizationId" AND c."id"=f."campaignId"
 JOIN "Brand" b ON b."organizationId"=f."organizationId" AND b."id"=f."brandId"
 JOIN "Approval" a ON a."organizationId"=f."organizationId" AND a."id"=f."approvalId"
 JOIN "MarketingSyntheticContact" s ON s."organizationId"=f."organizationId" AND s."brandId"=f."brandId" AND s."id"=NEW."contactId"
 JOIN "MarketingSyntheticConsent" e ON e."organizationId"=s."organizationId" AND e."contactId"=s."id" AND e."id"=NEW."consentEventId"
 WHERE f."organizationId"=NEW."organizationId" AND f."id"=NEW."formId"
 AND c."status"='APPROVED' AND c."brandId"=f."brandId" AND c."version"=f."campaignVersion" AND b."status"='ACTIVE'
 AND a."decision"='APPROVED' AND a."objectType"='MarketingConversionForm' AND a."objectId"=f."id" AND a."scopeDigest"=f."contentDigest"
 AND a."requestedBy"=f."createdBy" AND a."decidedBy" IS NOT NULL AND a."decidedBy"<>f."createdBy"
 AND e."action"='SIMULATED_OPT_IN'
 AND NOT EXISTS (SELECT 1 FROM "MarketingSyntheticConsent" later WHERE later."organizationId"=s."organizationId" AND later."contactId"=s."id" AND later."sequence">e."sequence")
 AND NOT EXISTS (SELECT 1 FROM "MarketingSyntheticConsent" suppress WHERE suppress."organizationId"=s."organizationId" AND suppress."contactId"=s."id" AND suppress."action" IN ('SIMULATED_COMPLAINT','SIMULATED_HARD_BOUNCE'))
 ) THEN RAISE EXCEPTION 'Submission requires current independently approved form, matching synthetic contact and effective opt-in'; END IF;
 RETURN NEW;
END;
$conversion_submission$;
CREATE TRIGGER "ConversionSubmission_scope" BEFORE INSERT ON "MarketingConversionSubmission" FOR EACH ROW EXECUTE FUNCTION medsol_conversion_submission_guard();
