-- R3: idempotency for virtual-only authored graph simulation, reusing the
-- canonical WorkflowExecution and WorkflowStepExecution ledger. No new table.
-- This does NOT authorize graph deployment, model calls or external tools.
CREATE UNIQUE INDEX "WorkflowExecution_R3_virtual_simulation_replay_key"
 ON "WorkflowExecution"("organizationId","correlationId")
 WHERE "workflowType"='BLUEPRINT_VIRTUAL_SIMULATION';

-- Existing WorkflowExecution identity, lease and approval owners unchanged.
-- Real graph dispatch remains prohibited until independently accepted R3.
