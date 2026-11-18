CREATE TABLE "BrainRun" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "commandKey" TEXT NOT NULL,
 "correlationId" TEXT NOT NULL, "input" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "currentAgentId" TEXT, "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3),
 CONSTRAINT "BrainRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BrainRun_organizationId_commandKey_key" ON "BrainRun"("organizationId","commandKey");
CREATE INDEX "BrainRun_organizationId_status_createdAt_idx" ON "BrainRun"("organizationId","status","createdAt");
CREATE TABLE "BrainRunStep" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "runId" TEXT NOT NULL,
 "agentId" TEXT NOT NULL, "stage" TEXT NOT NULL, "ordinal" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "executionId" TEXT, "error" TEXT,
 "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
 CONSTRAINT "BrainRunStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "BrainRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BrainRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BrainRunStep_runId_agentId_key" ON "BrainRunStep"("runId","agentId");
CREATE UNIQUE INDEX "BrainRunStep_runId_ordinal_key" ON "BrainRunStep"("runId","ordinal");
CREATE INDEX "BrainRunStep_organizationId_runId_status_idx" ON "BrainRunStep"("organizationId","runId","status");
