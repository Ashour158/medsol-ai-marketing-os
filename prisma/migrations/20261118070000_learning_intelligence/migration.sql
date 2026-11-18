CREATE TABLE "LearningSignal" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "topic" TEXT NOT NULL, "sector" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL,
 "sourceTitle" TEXT NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL,
 "sourcePublishedAt" TIMESTAMP(3), "evidence" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUARANTINED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LearningSignal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LearningSignal_organizationId_fingerprint_key" ON "LearningSignal"("organizationId","fingerprint");
CREATE INDEX "LearningSignal_organizationId_sector_status_observedAt_idx" ON "LearningSignal"("organizationId","sector","status","observedAt");
CREATE TABLE "AgentSkillProposal" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "agentId" TEXT NOT NULL,
 "skillKey" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "rationale" TEXT NOT NULL,
 "evidenceSignalId" TEXT NOT NULL, "evaluation" JSONB, "status" TEXT NOT NULL DEFAULT 'PROPOSED',
 "decidedBy" TEXT, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AgentSkillProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AgentSkillProposal_org_agent_skill_version_key" ON "AgentSkillProposal"("organizationId","agentId","skillKey","version");
CREATE INDEX "AgentSkillProposal_org_status_created_idx" ON "AgentSkillProposal"("organizationId","status","createdAt");
