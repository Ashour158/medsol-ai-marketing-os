-- Legacy submissions are preserved; new fixture writes include immutable protocol evidence.
ALTER TABLE "MarketingConversionSubmission" ADD COLUMN "protocolEvidence" JSONB;
ALTER TABLE "MarketingConversionSubmission" ADD CONSTRAINT "ConversionSubmission_protocol_fixture" CHECK (
 "protocolEvidence" IS NULL OR COALESCE((
  jsonb_typeof("protocolEvidence")='object' AND octet_length("protocolEvidence"::text)<=4096
  AND "protocolEvidence"->>'schema'='medsol.synthetic-crm.protocol.v1'
  AND "protocolEvidence"->>'scenario' IN ('ACCEPTED','REJECTED','OUTCOME_UNKNOWN','RATE_LIMITED','TIMEOUT_BEFORE_ACK',
   'TIMEOUT_AFTER_ACCEPT','READBACK_MISMATCH','DUPLICATE_CALLBACK','MALFORMED_RESPONSE','CONTACT_SCOPE_MISMATCH')
  AND "protocolEvidence"->>'outcome'="outcome"
  AND "protocolEvidence"->>'requestDigest' ~ '^sha256:[a-f0-9]{64}$'
  AND "protocolEvidence"->>'fixtureOnly'='true'
  AND "protocolEvidence"->>'actualCrmRequests'='0' AND "protocolEvidence"->>'actualLeadsCreated'='0'
  AND "protocolEvidence"->>'verifiedRemoteReceipts'='0'
  AND "protocolEvidence"->>'externalEffectsAuthorized'='false' AND "protocolEvidence"->>'automaticRetryAuthorized'='false'
  AND (("outcome"='MOCK_ACCEPTED' AND "protocolEvidence"->>'fixtureReadback'='MATCH'
    AND "protocolEvidence"->>'mockAcknowledgementStatus'='201'
    AND "protocolEvidence"->>'mockRecordRef' ~ '^internal:mock-crm/[a-f0-9]{64}$')
   OR ("outcome"<>'MOCK_ACCEPTED' AND "protocolEvidence"->>'fixtureReadback' IN ('MISMATCH','UNAVAILABLE')
    AND "protocolEvidence"->>'mockRecordRef' IS NULL))
 ),FALSE));
CREATE FUNCTION medsol_conversion_protocol_required() RETURNS trigger LANGUAGE plpgsql AS $crm_protocol$
BEGIN
 IF NEW."protocolEvidence" IS NULL THEN RAISE EXCEPTION 'New synthetic CRM submission requires protocol evidence'; END IF;
 RETURN NEW;
END;
$crm_protocol$;
CREATE TRIGGER "ConversionSubmission_protocol_required" BEFORE INSERT ON "MarketingConversionSubmission"
 FOR EACH ROW EXECUTE FUNCTION medsol_conversion_protocol_required();
