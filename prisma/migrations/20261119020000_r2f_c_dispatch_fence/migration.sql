-- R2F-C: extend the existing authoritative PublicationAttempt ledger with a
-- one-use, immutable NON-DISPATCHABLE release fence. REMOTE is still forbidden.
-- This records a deliberate operator denial; it is NOT a remote attempt.
ALTER TABLE "PublicationAttempt" DROP CONSTRAINT "PublicationAttempt_sandbox_only";
ALTER TABLE "PublicationAttempt" DROP CONSTRAINT "PublicationAttempt_nonproduction_outcome";
ALTER TABLE "PublicationAttempt" DROP CONSTRAINT "PublicationAttempt_internal_evidence";
ALTER TABLE "PublicationAttempt"
 ADD CONSTRAINT "PublicationAttempt_nonproduction_mode" CHECK
  ("mode" IN ('SANDBOX','RELEASE_FENCE'));
ALTER TABLE "PublicationAttempt"
 ADD CONSTRAINT "PublicationAttempt_fenced_outcome" CHECK (
  ("mode"='SANDBOX' AND "outcome" IN ('SIMULATED','BLOCKED','OUTCOME_UNKNOWN'))
   OR ("mode"='RELEASE_FENCE' AND "outcome"='BLOCKED')
 );
ALTER TABLE "PublicationAttempt"
 ADD CONSTRAINT "PublicationAttempt_fenced_internal_evidence" CHECK (
  ("mode"='SANDBOX' AND "evidenceRef" LIKE 'internal:sandbox/%')
  OR ("mode"='RELEASE_FENCE' AND
    "evidenceRef" ~ '^internal:release-fence/[a-f0-9]{64}$')
 );
CREATE UNIQUE INDEX "PublicationAttempt_one_release_fence_per_publication"
 ON "PublicationAttempt"("organizationId","publicationId")
 WHERE "mode"='RELEASE_FENCE';

-- An insert must match the canonical publication's immutable scope.
-- Appends are still forbidden on a simulated, cancelled or already blocked
-- publication. Existing update/delete denial trigger remains in place.
CREATE FUNCTION r2f_c_validate_dispatch_fence_insert() RETURNS trigger AS $$
DECLARE current_publication RECORD;
BEGIN
 IF NEW."mode"<>'RELEASE_FENCE' THEN RETURN NEW; END IF;
 SELECT "status","scopeDigest" INTO current_publication
  FROM "CampaignPublication"
  WHERE "organizationId"=NEW."organizationId" AND "id"=NEW."publicationId";
 IF NOT FOUND OR current_publication."status"<>'PREPARED' OR
   NEW."inputDigest" IS DISTINCT FROM current_publication."scopeDigest" OR
   NEW."sequence"<>1 THEN
  RAISE EXCEPTION 'Only current prepared publication can acquire a release fence'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PublicationAttempt_validate_release_fence"
 BEFORE INSERT ON "PublicationAttempt" FOR EACH ROW
 EXECUTE FUNCTION r2f_c_validate_dispatch_fence_insert();

-- Existing FORCE tenant RLS and attempt append-only protections still apply.
-- No remote adapter credential, publication success or external send path.
