-- Keep workflow checkpoints under the same append-only restrictive retention policy as their parent.
-- Earlier migration accidentally used ON DELETE CASCADE, which can erase execution history.
ALTER TABLE "WorkflowStepExecution"
  DROP CONSTRAINT "WorkflowStepExecution_workflowExecutionId_fkey";
ALTER TABLE "WorkflowStepExecution"
  ADD CONSTRAINT "WorkflowStepExecution_workflowExecutionId_fkey"
  FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
