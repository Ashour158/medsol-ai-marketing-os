# R3-J — Cross-engine fencing, uncertain-outcome recovery and release acceptance

**Date:** 19 November 2026. **Classification:** tested offline engineering hardening; **R3 NOT CERTIFIED**. No real social, ESP, model or creative accounts connected.

## Mandatory Reuse Map

| Concept | Authoritative existing owner | R3-J |
|---|---|---|
| DAG run, checkpoints, rollback | `MarketingWorkflowService`, `WorkflowExecution`, `WorkflowStepExecution` | Atomic proofed agent checkpoint and read-only recovery evidence; no second workflow ledger |
| Lease and generation | `WorkflowLeaseService` | Validate its token under a PostgreSQL row lock in the **same transaction** as step completion |
| Agent execution evidence | `AgentService`, `AgentExecution`, canonical agent manifest | Verify completed tenant/agent/correlation/causation proof and no-egress release evidence before step completion |
| Human decision | `ApprovalService`, `Approval`, `CommandReceipt` | Recheck signed pinned release during decision; fail closed on post-approval crash-window reconciliation |
| Audit and incident evidence | `AuditEvent`, `OutboxEvent`, `MarketingCommandCenterService` | Add read-only recovery and release readiness; no new incident store or fake acceptance proof |
| Tenant IAM | OIDC verified identity, `marketing-permissions` | Audit access only through verified tenant, active user/role, exact API and BFF route allowlists |
| External providers | Locked official gateway, simulated provider protocols, governed tool registry | No change: real remote publish/send/tool execution remains prohibited |

## Fixed failure windows

### Fenced agent checkpoint (P0)
Prior behavior called `leases.assertActive` and then directly updated a RUNNING step. Another worker could acquire a newer generation between that read and write, allowing a **stale worker to checkpoint**.

Now `dagCheckpointAgentStep` takes a PostgreSQL `FOR UPDATE` row lock on the canonical `WorkflowExecution`, validates tenant, RUNNING status, lease owner and generation, non-expiry, trusted nonrevoked pinned deployment, original pinned agent version and completed `AgentExecution` proof, and updates `WorkflowStepExecution` in the **same serializable transaction**. It requires explicit internal/no-model/no-tool/no-external-effects release evidence. The verified checkpoint creates an existing `AuditEvent`. A lost lease cannot write. Model reasoning must remain disabled.

If an agent outcome is uncertain, only a **still-current lease holder** can atomically record OUTCOME_UNKNOWN and BLOCKED. The stale holder cannot overwrite its successor's state. A successor encountering a RUNNING step blocks; no automatic replay of ambiguous actions.

### Revoked release after human approval (P0)
`ApprovalService` rechecks the pinned source release and signed digest at actual decision time and refuses to APPROVE after revocation. Explicit REJECTED decisions remain allowed.

A crash can occur **after** the canonical approval receipt commits but **before** workflow reconciliation. The canonical `dagReconcileApproval` now checks release provenance again under the same transaction; an old APPROVED receipt cannot resurrect a revoked deployment. It marks the authoritative workflow BLOCKED, step BLOCKED and emits an auditable `DAG_APPROVAL_RECEIPT_QUARANTINED` event.

### Read-only operator evidence
`GET /marketing/architecture/runs/:id/recovery` is OIDC/audit protected and exposes bounded canonical run status, release signature trust, lease generation, step statuses, approval decisions, agent execution evidence and an honest operator investigation code. No replay, repair, remote dispatch or direct step resume endpoint exists.

### Read-only R3 acceptance
`GET /marketing/architecture/readiness` reads tenant-scoped counts from authoritative blueprint, agent, knowledge, memory, graph, workflow, approval, outbox and model governance tables. It exposes explicitly non-certifying statuses and non-waivable gates for real provider accounts, remote MCP/A2A, restore/DR, independent security and the 500-scenario enterprise E2E matrix. Its verdict is **always NOT_CERTIFIED** until a separate independent acceptance process is implemented and evidenced. It **never** changes controls, providers or runtime permissions.

The existing Marketing Command Center now includes an R3-J audit-only panel showing these gates and one-run recovery evidence. This does not create a second incident or acceptance authority.

## Executed evidence and explicit boundaries

- `postgres-r3j-recovery-acceptance.integration.test.ts`: two contending PostgreSQL workers (CAS lease), a deterministic injected lease-theft race **after the old worker's successful in-memory fence check and before the checkpoint**, no stale step completion, successor quarantines ambiguous work without duplicate agent calls; revoked release before human approval; a committed approval receipt replayed after revocation; all actions remain tenant-scoped and no model calls; read-only release evidence, no false certification.
- Existing R3-G canonical signed deployment and PostgreSQL tests remain in the CI regression suite.
- Verify TypeScript, workspace tests, production build, clean and historical Prisma migration rehearsal, schema diff, dependency audit and SBOM in the PR's final green Actions run.
- **Not proven by this code:** production multi-node SIGKILL under real network effects, independently restored backups, on-call response completion, entire 500-case **executed** E2E matrix, independent penetration testing, verified eligible provider accounts, real sends or remote receipts, model invoice reconciliation, legal/consent UAT, or 99.9% uptime under load.

## Operator guidance

1. Treat `RELEASE_REVOKED_OR_UNTRUSTED`, `UNCERTAIN_STEP_REVIEW_REQUIRED` and expired lease states as **investigation-required**, not permission to retry.
2. Inspect the canonical agent execution proof, approval receipt, release digest and current lease generation before any manual disposition.
3. Do **not** manually reset a RUNNING step or force a second agent execution. No automatic replay route exists.
4. CI's passing offline tests are software evidence only, never independent production safety/legal/customer signoff.
5. Keep real provider credentials/account linking disabled until separately explicitly authorized.

## Remaining R3 P0 blockers

R3J improves crash and approval fencing, but does not close the no-account P0 external-provider dependencies. Full R3 certification still requires production-grade remote tool gateway and isolated credentials, approved official social/ESP destinations, independently verified billing, complete 500-case E2E execution, independent penetration/red-team review, restore + failover DR proof, comprehensive brand/agency RAG ACL and legal-retention verification. The user-directed no-real-provider period remains enforced.
