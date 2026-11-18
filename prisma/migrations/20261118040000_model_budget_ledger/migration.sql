CREATE TABLE "ModelBudget" (
  "organizationId" TEXT NOT NULL,
  "limitMicros" BIGINT NOT NULL,
  "reservedMicros" BIGINT NOT NULL DEFAULT 0,
  "spentMicros" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelBudget_pkey" PRIMARY KEY ("organizationId")
);
CREATE TABLE "ModelUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "reservedMicros" BIGINT NOT NULL,
  "actualMicros" BIGINT,
  "providerRequestId" TEXT,
  "evidenceReference" TEXT,
  "status" TEXT NOT NULL,
  "model" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ModelUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelUsage_organizationId_requestId_key" ON "ModelUsage"("organizationId", "requestId");
CREATE INDEX "ModelUsage_organizationId_status_createdAt_idx" ON "ModelUsage"("organizationId", "status", "createdAt");
ALTER TABLE "ModelBudget" ADD CONSTRAINT "ModelBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelBudget" ADD CONSTRAINT "ModelBudget_nonnegative" CHECK ("limitMicros" >= 0 AND "spentMicros" >= 0 AND "reservedMicros" >= 0 AND "spentMicros" + "reservedMicros" <= "limitMicros");
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_nonnegative" CHECK ("reservedMicros" >= 0 AND ("actualMicros" IS NULL OR ("actualMicros" >= 0 AND "actualMicros" <= "reservedMicros")));
