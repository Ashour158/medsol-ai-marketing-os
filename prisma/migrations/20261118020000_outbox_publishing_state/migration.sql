ALTER TABLE "OutboxEvent" ADD COLUMN "publishingAt" TIMESTAMP(3);
ALTER TABLE "OutboxEvent" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboxEvent" ADD COLUMN "lastError" TEXT;
CREATE INDEX "OutboxEvent_organizationId_publishedAt_publishingAt_occurredAt_idx" ON "OutboxEvent"("organizationId","publishedAt","publishingAt","occurredAt");