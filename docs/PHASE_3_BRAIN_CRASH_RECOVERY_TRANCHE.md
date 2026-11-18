# Phase 3 — Brain crash-window evidence, concurrency fencing and safe worker restart

## Reuse Map (no duplicate authority)
- **BrainRun/BrainRunStep** remain the only durable Brain execution owners. `BrainRunLedgerService` owns checkpointing, human quarantine and read-only crash evidence.
- **AgentExecution** remains the only authoritative internal decision record. A matching correlation ID alone is not sufficient proof of a step.
- **ModelUsage/ModelBudget** remain the only model reservation and settlement owners. Crash review reads their state, without changing it; billing review remains the existing separately authenticated reconciliation function.
- **OutboxEvent/InboxEvent** remain the transactional handoff and delivery owners. No second queue, retry loop or event processor is created.
- **BrainDispatchWorker** remains a PENDING-only scheduler. Shutdown prevents new claims, and stale RUNNING runs are NEVER auto-acquired by another worker.
- **Command Center** already identifies stale RUNNING and NEEDS_INTERVENTION incidents; the recovery evidence endpoint extends existing manager-only `READ_AUDIT` scope.
- **Operations Console** reuses the existing selected Brain-run UI; no alternative admin console was introduced.

## Correctness changes
1. The checkpoint transaction now checks that the completed `AgentExecution` has the matching tenant, agent, correlation, **Brain run ID in structured input**, and expected upstream `causationId`. It rejects cross-run reuse.
2. Before writing the step checkpoint or outbox event, it compare-and-swaps `BrainRun` on tenant, `RUNNING` and **the observed `updatedAt`**. A winning operator quarantine, a concurrent checkpoint or a different worker's run update makes the transaction fail. If later steps fail, the entire transaction is rolled back.
3. `GET /marketing/brain/runs/:id/recovery` returns only bounded, tenant-scoped internal execution status, causation match, relevant model usage/reservation status, checkpoint count and recommended human investigation; no free-text user prompt or raw external model result is disclosed. It is read-only and manager-audited.
4. The dispatcher stops accepting **new** claims when destroyed. In-flight work may still be interrupted by host shutdown; recovery stays manual and preserves uncertain provider billing.
5. Operator quarantine remains a deliberate, audited, rationale-gated action for RUNNING jobs inactive more than 15 minutes. Recovery evidence **never** authorizes a replay, a checkpoint repair, a model budget release, or external publication.

## Crash and failure-mode acceptance matrix
| Failure point | Durable evidence | Safe outcome |
| --- | --- | --- |
| Before PENDING claim | No Brain executor has claimed | Another worker may claim PENDING through the original CAS |
| Immediately after PENDING to RUNNING | RUNNING, incomplete step, possibly no agent record | No auto replay; stale alert and operator investigation |
| During remote model response | AgentExecution may be RUNNING; ModelUsage RESERVED | No retry; require provider billing and execution reconciliation |
| After completed AgentExecution but before checkpoint | One matching COMPLETED internal record; step PENDING | Detect without replay; present proof for explicit operator decision |
| Duplicate or wrong-causation execution | Conflicting agent records or mismatched upstream ID | Reject checkpoint / flag ambiguity |
| Concurrent operator quarantine vs checkpoint | BrainRun CAS on status/updatedAt | Exactly one wins; losing transaction emits no outbox event |
| Failure after committed checkpoint, before outbox delivery | Committed step and outbox in same transaction | Existing outbox/inbox idempotency; no repeat agent |
| Consumer or delivery failure | Existing outbox backoff and dead-letter | Retry only internal idempotent delivery; no agent or external model replay |
| Worker shutdown | Scheduler refuses new claims | RUNNING remains indeterminate until reviewed |

## Operator runbook
1. Inspect Command Center incident. Verify organization, run ID, last progress, selected agent and checkpoint status.
2. Use **Inspect crash-recovery evidence** (GET only). The report may show `ONE_COMPLETED_UNCHECKPOINTED`, `AMBIGUOUS_AGENT_OUTCOME`, `MULTIPLE_EXECUTION_ATTEMPTS`, `CONFLICTING_CAUSATION` or no completed proof. It is not an authorization to repair automatically.
3. Check ModelUsage `RESERVED` and `SETTLED` not independently billed, verify upstream provider receipts with the authorized finance workflow, and investigate any uncertain side effect.
4. For an abandoned RUNNING run inactive >15 minutes, an authorized human may quarantine with a reason. This moves the run to NEEDS_INTERVENTION and creates an audit event; it cannot be re-run automatically.
5. Any controlled salvage or checkpoint adoption requires an additional separately designed, dual-approved command with independent execution proof and financial reconciliation. This tranche deliberately adds **no such command**.
6. Reconcile outbox and inbox delivery using existing dead-letter observation, preserving event IDs and idempotency.

## Executable tests
- `brain-crash-recovery.test.ts`: no-replay invariant, cross-run and tenant-scoped proof filters, uncertain budget, CAS losing race, and one internal handoff.
- `postgres-brain-crash-recovery.integration.test.ts`: PostgreSQL crash after completed agent record, model RESERVED, quarantine before checkpoint; valid checkpoint once and stable outbox event ID.
- `brain-dispatch-skill-release.test.ts`: PENDING-only restart and shutdown without new claims.
- Existing `brain-run-quarantine.test.ts`, `brain-handoff-outbox.test.ts` and `outbox-delivery.test.ts` remain authoritative adjacent tests.

## Release gates
CI migrations, typechecking, PostgreSQL tests and build are necessary but not sufficient. Still required: staging fault injection across **two real worker processes**, SIGTERM/SIGKILL timing, verified model provider receipts, accurate clock/heartbeat and long-running-run classification, realistic 13-agent scenario, measured recovery RTO/RPO and performance under production volume. Azure Entra and on-call paging destinations remain unconfigured; publishing and autonomous model replay remain blocked. No live production reliability claim is made.
