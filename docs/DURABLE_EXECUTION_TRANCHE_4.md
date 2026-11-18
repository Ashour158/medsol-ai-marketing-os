# Durable Execution & Billing Reconciliation — Tranche 4

## Delivered
- Repaired the prior model gateway CI compilation blocker: `agent-runtime` no longer imports undeclared `zod`. The gateway uses strict, dependency-free request and response parsing.
- Added workflow lease schema with owner UUID, expiration and monotonically increasing fencing generation, plus a database migration.
- Added tenant-scoped `WorkflowLeaseService` with compare-and-swap claim, heartbeat, active lease validation and fenced release.
- Added internal `ModelReconciliationService` that settles reserved model usage only with a provider request ID and evidence reference, rejects over-reservation charges and records evidence in the authoritative usage ledger.
- Added tests for lease conflicts, stale generation, cross-tenant denial, idempotent billing settlement, overspend rejection and evidence persistence.

## Integration status and limitations
- Lease primitives are **not yet wired into workflow dispatch and step mutation**. Existing workflow `RUNNING` recovery still rejects automatic takeover. This is intentional: changing orchestration semantics without fencing every side-effecting write risks duplicate campaigns and external actions.
- The reconciliation service is **internal-only**; no untrusted HTTP endpoint exists. Actual provider invoice verification, automatic stale reservation scanning and durable alert delivery remain unimplemented. Never treat arbitrary agent-supplied evidence as verified billing proof.
- No external model adapter is enabled. Model calls remain disabled by default.
- The model usage ledger is not yet a complete financial ledger; currency and immutable price-book/version governance are required before live spend.
- Microsoft Entra remains deferred; production identity guards remain intact.
- CI completion and staging migration execution are separate release gates.

## Next execution phase
1. Fence workflow step updates and campaign commands using the lease generation; integrate heartbeat and bounded worker retries.
2. Add a durable dispatch queue/outbox consumer and dead-letter state transitions with operator-only replay.
3. Add provider-authenticated billing reconciliation worker and reconciliation alerts.
4. Introduce approved model adapter and price-book with controlled secrets and egress; keep external publishing human-approved.
