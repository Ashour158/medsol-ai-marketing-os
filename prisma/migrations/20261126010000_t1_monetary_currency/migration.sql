ALTER TABLE "MarketingMetricObservation" ADD COLUMN "currency" TEXT;
-- Historical unlabelled spend stays unlabelled; never infer or convert it.
ALTER TABLE "MarketingMetricObservation" ADD CONSTRAINT "MarketingMetricObservation_currency_scope" CHECK (
 ("metricKey"='spend_micros' AND ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'))
 OR ("metricKey" IN ('reported_revenue_micros','reported_gross_profit_micros') AND "currency" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$')
 OR ("metricKey" NOT IN ('spend_micros','reported_revenue_micros','reported_gross_profit_micros') AND "currency" IS NULL)
);
CREATE FUNCTION medsol_metric_currency_immutable() RETURNS trigger LANGUAGE plpgsql AS $metric_currency$
BEGIN
 IF OLD."currency" IS DISTINCT FROM NEW."currency" THEN
  RAISE EXCEPTION 'Source currency is immutable; no currency backfill by review';
 END IF;
 RETURN NEW;
END;
$metric_currency$;
CREATE TRIGGER "MarketingMetricObservation_currency_guard" BEFORE UPDATE ON "MarketingMetricObservation" FOR EACH ROW EXECUTE FUNCTION medsol_metric_currency_immutable();
