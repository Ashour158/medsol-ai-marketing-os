-- R3-Q: eight existing tenant-owned IAM, agent, brain, workflow and approval authorities.
-- No replacement sources of truth, no automatic replay of uncertain executions.
-- PostgreSQL runtime role must never be SUPERUSER or BYPASSRLS (R3-P).
-- API / workers must set tenant context inside a transaction for all access.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY "User_r3q_tenant_read" ON "User" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "User_r3q_tenant_insert" ON "User" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "User_r3q_tenant_update" ON "User" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.


ALTER TABLE "Agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Agent_r3q_tenant_read" ON "Agent" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "Agent_r3q_tenant_insert" ON "Agent" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "Agent_r3q_tenant_update" ON "Agent" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.


ALTER TABLE "AgentExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentExecution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentExecution_r3q_tenant_read" ON "AgentExecution" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentExecution_r3q_tenant_insert" ON "AgentExecution" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "AgentExecution_r3q_tenant_update" ON "AgentExecution" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.


ALTER TABLE "BrainRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrainRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BrainRun_r3q_tenant_read" ON "BrainRun" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BrainRun_r3q_tenant_insert" ON "BrainRun" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BrainRun_r3q_tenant_update" ON "BrainRun" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.


ALTER TABLE "BrainRunStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrainRunStep" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BrainRunStep_r3q_tenant_read" ON "BrainRunStep" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BrainRunStep_r3q_tenant_insert" ON "BrainRunStep" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "BrainRunStep_r3q_tenant_update" ON "BrainRunStep" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.


ALTER TABLE "WorkflowExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowExecution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "WorkflowExecution_r3q_tenant_read" ON "WorkflowExecution" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "WorkflowExecution_r3q_tenant_insert" ON "WorkflowExecution" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "WorkflowExecution_r3q_tenant_update" ON "WorkflowExecution" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.


ALTER TABLE "WorkflowStepExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowStepExecution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "WorkflowStepExecution_r3q_tenant_read" ON "WorkflowStepExecution" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "WorkflowStepExecution_r3q_tenant_insert" ON "WorkflowStepExecution" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "WorkflowStepExecution_r3q_tenant_update" ON "WorkflowStepExecution" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.


ALTER TABLE "Approval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Approval" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Approval_r3q_tenant_read" ON "Approval" FOR SELECT
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "Approval_r3q_tenant_insert" ON "Approval" FOR INSERT
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "Approval_r3q_tenant_update" ON "Approval" FOR UPDATE
 USING ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId"=nullif(current_setting('app.marketing_tenant_id',true),''));
-- No DELETE policies: history is retained until a separately authorized retention workflow.
