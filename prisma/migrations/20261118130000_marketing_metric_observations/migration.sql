CREATE UNIQUE INDEX "Campaign_organizationId_id_key" ON "Campaign"("organizationId","id");
CREATE TABLE "MarketingMetricObservation" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "campaignId" TEXT NOT NULL,
 "sourceSystem" TEXT NOT NULL,
 "sourceRecordId" TEXT NOT NULL,
 "metricKey" TEXT NOT NULL,
 "value" BIGINT NOT NULL,
 "observedAt" TIMESTAMP(3) NOT NULL,
 "sourceReference" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
 "submittedBy" TEXT NOT NULL,
 "reviewedBy" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MarketingMetricObservation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MarketingMetricObservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "MarketingMetricObservation_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId","campaignId") REFERENCES "Campaign"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "MarketingMetricObservation_nonnegative" CHECK ("value" >= 0),
 CONSTRAINT "MarketingMetricObservation_review_state" CHECK (
   ("status"='QUARANTINED' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL)
   OR ("status"='REVIEWED' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "MarketingMetricObservation_organizationId_sourceSystem_sourceRecordId_metricKey_key"
 ON "MarketingMetricObservation"("organizationId","sourceSystem","sourceRecordId","metricKey");
CREATE INDEX "MarketingMetricObservation_organizationId_campaignId_status_observedAt_idx"
 ON "MarketingMetricObservation"("organizationId","campaignId","status","observedAt");
