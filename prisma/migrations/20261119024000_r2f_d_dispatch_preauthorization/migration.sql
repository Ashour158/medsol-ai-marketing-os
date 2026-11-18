-- R2F-D: durable, PRE-AUTHORIZATION dispatch reservation in the canonical
-- PublicationAttempt ledger. This does NOT grant egress or record a remote send.
-- REMOTE mode and PUBLISHED status remain forbidden at the database layer.
ALTER TABLE "PublicationAttempt"
 ADD COLUMN "integrationConnectionId" TEXT,
 ADD COLUMN "providerKey" TEXT,
 ADD COLUMN "reservationExpiresAt" TIMESTAMP(3);

ALTER TABLE "PublicationAttempt" DROP CONSTRAINT "PublicationAttempt_nonproduction_mode";
ALTER TABLE "PublicationAttempt" DROP CONSTRAINT "PublicationAttempt_fenced_outcome";
ALTER TABLE "PublicationAttempt" DROP CONSTRAINT "PublicationAttempt_fenced_internal_evidence";

ALTER TABLE "PublicationAttempt"
 ADD CONSTRAINT "PublicationAttempt_r2f_d_nonproduction_mode" CHECK
 ("mode" IN ('SANDBOX','RELEASE_FENCE','DISPATCH_RESERVATION'));
ALTER TABLE "PublicationAttempt"
 ADD CONSTRAINT "PublicationAttempt_r2f_d_outcome" CHECK (
  ("mode"='SANDBOX' AND "outcome" IN ('SIMULATED','BLOCKED','OUTCOME_UNKNOWN'))
  OR ("mode"='RELEASE_FENCE' AND "outcome"='BLOCKED')
  OR ("mode"='DISPATCH_RESERVATION' AND "outcome"='AWAITING_AUTHORIZATION')
 );
ALTER TABLE "PublicationAttempt"
 ADD CONSTRAINT "PublicationAttempt_r2f_d_evidence" CHECK (
  ("mode"='SANDBOX' AND "evidenceRef" LIKE 'internal:sandbox/%')
  OR ("mode"='RELEASE_FENCE' AND
    "evidenceRef" ~ '^internal:release-fence/[a-f0-9]{64}$')
  OR ("mode"='DISPATCH_RESERVATION' AND
    "evidenceRef" ~ '^internal:dispatch-reservation/[a-f0-9]{64}$')
 );
ALTER TABLE "PublicationAttempt"
 ADD CONSTRAINT "PublicationAttempt_r2f_d_metadata" CHECK (
  ("mode" IN ('SANDBOX','RELEASE_FENCE') AND
   "integrationConnectionId" IS NULL AND "providerKey" IS NULL AND
   "reservationExpiresAt" IS NULL)
  OR ("mode"='DISPATCH_RESERVATION' AND
   "integrationConnectionId" IS NOT NULL AND
   "providerKey" IS NOT NULL AND length("providerKey") BETWEEN 3 AND 80 AND
   "reservationExpiresAt" IS NOT NULL)
 );
CREATE INDEX "PublicationAttempt_org_conn_time_idx"
 ON "PublicationAttempt"("organizationId","integrationConnectionId","createdAt");
CREATE UNIQUE INDEX "PublicationAttempt_one_reservation_per_publication"
 ON "PublicationAttempt"("organizationId","publicationId")
 WHERE "mode"='DISPATCH_RESERVATION';
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_org_conn_fk"
 FOREIGN KEY ("organizationId","integrationConnectionId")
 REFERENCES "IntegrationConnection"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;

-- Status is an internal authorization-escrow state. No PUBLISHED / SENT state.
ALTER TABLE "CampaignPublication" DROP CONSTRAINT "CampaignPublication_valid_status";
ALTER TABLE "CampaignPublication"
 ADD CONSTRAINT "CampaignPublication_valid_status" CHECK (
  "status" IN ('PREPARED','AWAITING_AUTHORIZATION','SIMULATED',
    'BLOCKED','OUTCOME_UNKNOWN','CANCELLED')
 );

-- Defense in depth: direct SQL inserting a fake reservation must still match
-- the authoritative tenant/approval/connection and only a PREPARED publication.
CREATE FUNCTION r2f_d_validate_authorization_escrow() RETURNS trigger AS $$
DECLARE source_record RECORD;
BEGIN
 IF NEW."mode"<>'DISPATCH_RESERVATION' THEN RETURN NEW; END IF;

 SELECT p."status" AS publication_status,p."scopeDigest" AS scope_digest,
        a."decision" AS approval_decision,a."scopeDigest" AS approval_digest,
        a."scope" AS approved_scope,
        c."status" AS connection_status,c."providerKey" AS connection_provider,
        c."brandId" AS connection_brand,c."destinationRef" AS connection_destination
 INTO source_record
 FROM "CampaignPublication" p
 JOIN "Approval" a ON a."organizationId"=p."organizationId"
  AND a."id"=p."approvalId"
 JOIN "IntegrationConnection" c ON c."organizationId"=p."organizationId"
  AND c."id"=NEW."integrationConnectionId"
 WHERE p."organizationId"=NEW."organizationId" AND p."id"=NEW."publicationId";

 IF NOT FOUND OR source_record.publication_status<>'PREPARED'
  OR source_record.scope_digest IS DISTINCT FROM NEW."inputDigest"
  OR source_record.approval_digest IS DISTINCT FROM NEW."inputDigest"
  OR source_record.approval_decision<>'APPROVED'
  OR source_record.connection_status<>'PENDING_VERIFICATION'
  OR source_record.connection_provider IS DISTINCT FROM NEW."providerKey"
  OR source_record.connection_brand IS DISTINCT FROM
     (source_record.approved_scope->>'brandId')
  OR source_record.connection_destination IS DISTINCT FROM
     (source_record.approved_scope->>'destinationRef')
  OR NEW."sequence"<>1 THEN
  RAISE EXCEPTION 'Preauthorization reservation requires exact current tenant scope'
   USING ERRCODE='23514';
 END IF;

 IF NEW."reservationExpiresAt"<=CURRENT_TIMESTAMP
  OR NEW."reservationExpiresAt">CURRENT_TIMESTAMP+INTERVAL '15 minutes'
  OR NEW."createdAt">CURRENT_TIMESTAMP+INTERVAL '1 minute'
  OR NEW."createdAt"<CURRENT_TIMESTAMP-INTERVAL '1 minute' THEN
  RAISE EXCEPTION 'Preauthorization reservation must have bounded fresh expiry'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PublicationAttempt_validate_authorization_escrow"
 BEFORE INSERT ON "PublicationAttempt" FOR EACH ROW
 EXECUTE FUNCTION r2f_d_validate_authorization_escrow();

-- Existing append-only UPDATE/DELETE trigger, immutable publication identity
-- and FORCE tenant RLS continue to apply. No provider HTTP egress or unlock.

-- Prevent bypassing the escrow lifetime through direct UPDATE of publication.
-- This trigger does not authorize a provider send; it only protects transitions.
CREATE FUNCTION r2f_d_guard_escrow_publication_state() RETURNS trigger AS $$
DECLARE escrow_expiry TIMESTAMP(3);
BEGIN
 IF NEW."status"='AWAITING_AUTHORIZATION' AND
    OLD."status" IS DISTINCT FROM NEW."status" THEN
  IF OLD."status"<>'PREPARED' OR NEW."version"<>OLD."version"+1
   OR NOT EXISTS(
    SELECT 1 FROM "PublicationAttempt" a
    WHERE a."organizationId"=OLD."organizationId"
     AND a."publicationId"=OLD."id"
     AND a."mode"='DISPATCH_RESERVATION'
     AND a."outcome"='AWAITING_AUTHORIZATION'
   ) THEN
   RAISE EXCEPTION 'Dispatch preauthorization requires one committed reservation'
    USING ERRCODE='23514';
  END IF;
 END IF;
 IF OLD."status"='AWAITING_AUTHORIZATION' THEN
  SELECT "reservationExpiresAt" INTO escrow_expiry
   FROM "PublicationAttempt"
   WHERE "organizationId"=OLD."organizationId"
    AND "publicationId"=OLD."id" AND "mode"='DISPATCH_RESERVATION';
  IF NEW."status"<>'BLOCKED' OR NEW."version"<>OLD."version"+1
    OR escrow_expiry IS NULL OR escrow_expiry>CURRENT_TIMESTAMP THEN
   RAISE EXCEPTION 'Preauthorization can only close as BLOCKED after expiry'
    USING ERRCODE='23514';
  END IF;
 END IF;
 IF OLD."status" IN ('BLOCKED','CANCELLED','SIMULATED','OUTCOME_UNKNOWN')
   AND NEW."status" IS DISTINCT FROM OLD."status" THEN
  RAISE EXCEPTION 'Terminal publication status cannot be reopened'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CampaignPublication_guard_escrow_state"
 BEFORE UPDATE ON "CampaignPublication" FOR EACH ROW
 EXECUTE FUNCTION r2f_d_guard_escrow_publication_state();
