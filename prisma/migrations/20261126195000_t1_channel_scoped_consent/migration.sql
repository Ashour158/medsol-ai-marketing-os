-- Existing consent events retain EMAIL semantics. All channels share the canonical append-only ledger and global per-contact sequence.
ALTER TABLE "MarketingSyntheticConsent" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "MarketingSyntheticConsent" ADD CONSTRAINT "MarketingSyntheticConsent_channel_check" CHECK ("channel" IN ('EMAIL','WHATSAPP','SMS'));
CREATE INDEX "SyntheticConsent_channel_sequence_idx" ON "MarketingSyntheticConsent"("organizationId","contactId","channel","sequence");
CREATE OR REPLACE FUNCTION t1_guard_synthetic_permanent_suppression() RETURNS trigger AS $$
BEGIN
 IF NEW."action"='SIMULATED_OPT_IN' AND EXISTS (SELECT 1 FROM "MarketingSyntheticConsent" WHERE "organizationId"=NEW."organizationId" AND "contactId"=NEW."contactId" AND "channel"=NEW."channel" AND "action" IN ('SIMULATED_COMPLAINT','SIMULATED_HARD_BOUNCE')) THEN
 RAISE EXCEPTION 'Permanent synthetic channel suppression is irreversible' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION medsol_conversion_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $conversion_submission$
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
 AND e."channel"='EMAIL' AND e."action"='SIMULATED_OPT_IN'
 AND NOT EXISTS (SELECT 1 FROM "MarketingSyntheticConsent" later WHERE later."organizationId"=s."organizationId" AND later."contactId"=s."id" AND later."channel"='EMAIL' AND later."sequence">e."sequence")
 AND NOT EXISTS (SELECT 1 FROM "MarketingSyntheticConsent" suppress WHERE suppress."organizationId"=s."organizationId" AND suppress."contactId"=s."id" AND suppress."channel"='EMAIL' AND suppress."action" IN ('SIMULATED_COMPLAINT','SIMULATED_HARD_BOUNCE'))
 ) THEN RAISE EXCEPTION 'Submission requires current independently approved form, matching synthetic contact and effective opt-in'; END IF;
 RETURN NEW;
END;
$conversion_submission$;
