# R3-Q — IAM, Agent, Brain, Workflow and Approval FORCE RLS

**Engineering tranche:** 20 November 2026. **Release verdict: NOT_CERTIFIED**. External provider accounts, model inference, live posts and email remain disabled.

## Mandatory Reuse Map

| Existing authoritative owner | Extended R3-Q responsibility | Explicitly not duplicated |
|---|---|---|
| `PrismaService` and `withMarketingTenant` | Reuse pooled-safe transaction-local tenant context; no direct global `SET` | Parallel tenant middleware, shadow tenants or login context |
| `User`, `AuthSession`, `TenantRolePolicyService`, `BootstrapAuthGuard` | FORCE RLS on canonical `User` + existing session/role checks, verify current OIDC identity in scoped transaction | New users, roles, tokens or authorization owner |
| `AgentService`, `Agent`, `AgentExecution` | Tenant-only installation, signed release checks, persisted agent execution/correlation; never duplicate agent manifests | Second agent engine or non-audited inference |
| `BrainRunLedgerService`, `BrainRunExecutorService`, `BrainDispatchWorker`, `BrainRun`, `BrainRunStep` | Tenant-scoped durable run/checkpoint, worker round-robin by canonical Organization; CAS and manual-only unknown recovery | New scheduler tables, blind retries or another brain owner |
| `MarketingWorkflowService`, `WorkflowLeaseService`, `WorkflowExecution`, `WorkflowStepExecution` | Scoped lease/fencing, run and step transitions and approved blueprint DAGs | Parallel workflow runtime, implicit remote dispatch |
| `ApprovalService`, canonical `Approval` | Require scoped transaction-local human maker-checker decisions; maintain frozen approval scope and audit | Approval shadow ledger or self-approval |
| `MarketingCommandCenterService`, `MarketingIncidentResponseService` | Scoped reads and tenant-by-tenant incident/agent scans; preserve operator intervention and incident provenance | Global bypass-role incident read service |
| Sole `r3l-acceptance-case-index.mjs` and `r3n-tenant-rls-inventory.mjs` | 149 mapped engineering cases and 27 FORCE RLS regression checks | Fabricated 500 signed independent E2E or new evidence registry |

## Changes

The existing migration `20261120050000_r3q_iam_agent_brain_workflow_rls` sets `ENABLE` and `FORCE ROW LEVEL SECURITY` on eight existing canonical tables: `User`, `Agent`, `AgentExecution`, `BrainRun`, `BrainRunStep`, `WorkflowExecution`, `WorkflowStepExecution`, `Approval`. Only exact `organizationId=app.marketing_tenant_id` may SELECT, INSERT or UPDATE. No broad DELETE grants were added. A missing transaction-local tenant context is a hard deny for non-BYPASSRLS database connections.

The service changes use `withMarketingTenant` or pre-existing `set_config(...,true)` within database transactions, not pooled session-level state. The Brain worker enumerates canonical `Organization` IDs to find work, then queries protected runs separately inside each tenant's scoped transaction. A losing CAS race or uncertain execution remains operator-intervention only; no provider effect is replayed. A local round-robin cursor is convenience/fairness and **is not a durable distributed queue priority guarantee**.

## Real PostgreSQL acceptance

`postgres-r3q-iam-brain-workflow-rls.integration.test.ts` executes:

- **T01-013**: actual non-BYPASSRLS PostgreSQL role sees one row in each of the eight tables within its tenant, zero without tenant context and zero from a different tenant; cross-tenant UPDATE and no-context INSERT are refused.
- **T04-034**: existing workflow leases reject wrong-tenant or non-running claims; brain ledger cannot read another tenant's run and returns its own canonical steps.
- **T15-024**: a tenant-iterating Brain worker uses trusted scoped transactions, processes two pending runs through one existing executor, and makes no provider-model or remote publication attempts.

The 500-case register remains explicit: **149 engineering assertions (111 offline, 38 real PostgreSQL), 351 unmapped; zero externally signed 500-case E2E**. The CI actual census is expected to measure **39/46 tenant-relevant tables FORCE-protected**, seven remaining to be addressed. These are targets, not production sign-off.

## Next security scope

The remaining seven authority tables are `AuditEvent`, `CommandReceipt`, `InboxEvent`, `OutboxEvent`, `ModelBudget`, `ModelUsage` and `IncidentResponse`. They require special attention because outbox publishing and incident alert monitors scan multiple tenants, model billing has reconciled/estimated state, and audit events must not be deleted or mutated by ordinary application users. Do **not** apply blind policies that make background delivery fail or substitute a privileged BYPASSRLS application role; correct the canonical worker transactions and test low-privilege access.

**Not certified:** production app role/deployment, independent penetration test, complete signed 500-case browser/operator acceptance, real PITR/RTO/RPO, actual consent/legal approval and provider staging UAT (intentionally deferred). No real connections or messages are touched.
