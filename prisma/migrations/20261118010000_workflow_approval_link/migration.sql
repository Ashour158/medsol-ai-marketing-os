ALTER TABLE "Approval" ADD COLUMN "workflowExecutionId" TEXT;
CREATE INDEX "Approval_organizationId_workflowExecutionId_idx" ON "Approval"("organizationId","workflowExecutionId");
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;