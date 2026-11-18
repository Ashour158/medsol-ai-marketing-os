# Phase 1 and Phase 2 integration — execution checkpoint

## Reuse map
- Authoritative agent registry/execution: `AgentService`, `AgentRuntime`, `AgentExecution`.
- Authoritative brain plan: `getBrainPlan` and existing 13-agent roster.
- Authoritative durable brain records: `BrainRun`, `BrainRunStep`, `BrainRunLedgerService`.
- Authoritative permission checks: `marketing-permissions.ts` and `BootstrapAuthGuard`.
- Domain checks: `assessDomain` and existing deterministic domain engines.

## Changes
- Fixed malformed brain-route regex and test fixture typing that blocked CI.
- Introduced `BrainRunExecutorService`: a tenant-scoped, explicit operator-triggered execution path that claims a PENDING brain run once, executes registered agents in stage order and commits checkpoints using the existing ledger. It never automatically takes over RUNNING work.
- Any failure leaves the run NEEDS_INTERVENTION rather than silently replaying an ambiguous operation. Completed runs end REVIEW_REQUIRED.
- Added an authenticated POST `/marketing/brain/runs/:id/execute` with EXECUTE_WORKFLOW permission and same-origin web proxy allowlist.
- Domain assessments now accompany generic agent decisions. They are evidence/consent/brand control assessments, not verified research or model reasoning.
- Added executor tests for failure, claim and authorization.

## Incomplete phase acceptance gates
**Phase 1 not yet complete:** no worker pool, queue/scheduler, heartbeat lease, checkpoint/outbox atomicity, safe operator reconciliation, typed inter-agent event routing, distributed tracing or complete failure-injection E2E validation. The operator-triggered executor is a synchronous foundation only.

**Phase 2 not yet complete:** no independent trusted-source ingestion or citation verification, model-backed reasoning in each of 13 agents, licensed market feeds, true source-grounded content creation, quantitative marketing analytics, portfolio integration, automated skill evaluation/promotion/rollback, or full quality benchmark suite.

**Safety:** external publication, live advertising spend, customer messaging and self-modifying skills remain disabled. Entra staging configuration remains deferred. Never claim production readiness from a passing typecheck alone.
