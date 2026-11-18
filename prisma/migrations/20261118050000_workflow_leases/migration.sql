ALTER TABLE "WorkflowExecution" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "WorkflowExecution" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "WorkflowExecution" ADD COLUMN "leaseGeneration" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "WorkflowExecution_status_leaseExpiresAt_idx" ON "WorkflowExecution"("status","leaseExpiresAt");
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_lease_consistency" CHECK (("leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL) OR ("leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL));
