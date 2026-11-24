-- Extend the canonical anonymous suppression ledger; no real contact or ESP state.
ALTER TABLE "MarketingSyntheticConsent" DROP CONSTRAINT "MarketingSyntheticConsent_action";
ALTER TABLE "MarketingSyntheticConsent" ADD CONSTRAINT "MarketingSyntheticConsent_action"
 CHECK ("action" IN ('SIMULATED_OPT_IN','SIMULATED_WITHDRAWAL','SIMULATED_COMPLAINT','SIMULATED_HARD_BOUNCE'));

CREATE FUNCTION t1_guard_synthetic_permanent_suppression() RETURNS trigger AS $$
BEGIN
 IF NEW."action"='SIMULATED_OPT_IN' AND EXISTS (
  SELECT 1 FROM "MarketingSyntheticConsent"
  WHERE "organizationId"=NEW."organizationId" AND "contactId"=NEW."contactId"
   AND "action" IN ('SIMULATED_COMPLAINT','SIMULATED_HARD_BOUNCE')
 ) THEN
  RAISE EXCEPTION 'Permanent synthetic suppression is irreversible' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "MarketingSyntheticConsent_permanent_suppression"
 BEFORE INSERT ON "MarketingSyntheticConsent" FOR EACH ROW
 EXECUTE FUNCTION t1_guard_synthetic_permanent_suppression();
