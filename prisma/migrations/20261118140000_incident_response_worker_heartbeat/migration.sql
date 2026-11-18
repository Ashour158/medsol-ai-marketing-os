-- Additive operational response metadata; existing Brain/Outbox business ownership unchanged.
CREATE TABLE "IncidentResponse" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "occurrenceAt" TIMESTAMP(3) NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "acknowledgedReason" TEXT,
  "lastNotifiedLevel" INTEGER NOT NULL DEFAULT -1,
  "nextEscalationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncidentResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IncidentResponse_organizationId_kind_sourceId_key"
  ON "IncidentResponse"("organizationId","kind","sourceId");
CREATE INDEX "IncidentResponse_organizationId_kind_acknowledgedAt_idx"
  ON "IncidentResponse"("organizationId","kind","acknowledgedAt");
ALTER TABLE "IncidentResponse" ADD CONSTRAINT "IncidentResponse_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MarketingWorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "workerType" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastTickAt" TIMESTAMP(3),
  "lastTickStatus" TEXT,
  CONSTRAINT "MarketingWorkerHeartbeat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketingWorkerHeartbeat_workerType_lastSeenAt_idx"
  ON "MarketingWorkerHeartbeat"("workerType","lastSeenAt");
