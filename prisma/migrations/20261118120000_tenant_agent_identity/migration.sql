-- Reuse the authoritative Agent owner; do not introduce shadow agent installations.
-- Existing rows with cross-tenant references intentionally cause this migration to fail.
ALTER TABLE "AgentExecution" DROP CONSTRAINT "AgentExecution_agentId_fkey";
ALTER TABLE "Agent" DROP CONSTRAINT "Agent_pkey";
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_pkey" PRIMARY KEY ("organizationId", "id");
ALTER TABLE "AgentExecution"
  ADD CONSTRAINT "AgentExecution_organizationId_agentId_fkey"
  FOREIGN KEY ("organizationId","agentId") REFERENCES "Agent"("organizationId","id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
