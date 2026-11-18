ALTER TABLE "OutboxEvent" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "OutboxEvent" ADD COLUMN "deadLetteredAt" TIMESTAMP(3);
CREATE INDEX "OutboxEvent_delivery_schedule_idx" ON "OutboxEvent"("publishedAt","deadLetteredAt","nextAttemptAt","occurredAt");
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_dead_letter_not_published" CHECK ("deadLetteredAt" IS NULL OR "publishedAt" IS NULL);
