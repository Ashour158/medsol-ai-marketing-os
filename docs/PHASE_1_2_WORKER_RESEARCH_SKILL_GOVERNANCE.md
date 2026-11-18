# Phase 1/2 implementation checkpoint — 2026-11-18

## Reuse map and authority
- `AgentService` and `AgentExecution`: sole authoritative agent execution records.
- `BrainRun`, `BrainRunStep`, `BrainRunLedgerService`: sole authoritative brain checkpoint records.
- `BrainRunExecutorService`: CAS run claim and synchronous checkpointed handoffs.
- `MarketingLearningService`, `LearningSignal`: sole trusted/untrusted signal registry, dedup and operator review.
- `AgentSkillProposal`: sole skill proposal/decision registry.
- `BootstrapAuthGuard` / `marketing-permissions.ts`: authorization; tenant from verified request identity.
- `AgentRuntime` policy, `domain-intelligence.ts`: immutable capability boundaries. No parallel data authorities.

## New integration work
1. Added `BrainDispatchWorker`, a bounded opt-in queue polling loop with a per-process busy guard and DB-level CAS claim. Set `MARKETING_BRAIN_WORKER_ENABLED=true` to run it within the Nest process; `MARKETING_BRAIN_POLL_MS` is clamped between 1 and 60 seconds, default 10 seconds. Deployment owners must configure one or more controlled workers and process supervision. Ambiguous RUNNING executions are never automatically requeued.
2. Fixed Next.js proxy route validation for 4-segment `/marketing/brain/runs/:id/execute` and `/:id/quarantine`, plus earlier typecheck defects.
3. Corrected brain request idempotency: generated correlation IDs do not change command intent. Different substantive commands still conflict on the same tenant command key.
4. Added read-only source-bounded `ScientificLiteratureConnector` for Europe PMC, with fixed provider hostname, non-redirecting bounded requests, JSON response checks, limited results and size, a sector allowlist and quarantined evidence ingestion. It is an opt-in user-triggered discovery route, not a scheduled web crawler. Retrieved metadata is **not independently verified**.
5. Added tenant-scoped trend brief from human-reviewed signals, grouped by topic/sector with evidence citations, recency and distinct source hosts. A repeated topic is a *research priority*, not established scientific fact.
6. Added `SkillReleaseService`: fixed, code-reviewed policy regression corpus, persistent evaluation decisions, human authorization for implementation, audit records and explicit non-activation until a separately reviewed code release. No self-modifying runtime capabilities.
7. Added tests for worker dispatch, scientific connector safety, learning trend summaries and skill release permission gates. API and web proxy wiring included.

## Current truthful completion state
This is a significant operational step forward, **not full acceptance** for the user's requested Phase 1 and Phase 2:
- Phase 1 missing distributed lease generation fencing and heartbeats for long-running Brain steps, independent worker deployment, typed handoff event contracts, outbox/inbox atomic end-to-end handoff, retry/dead-letter policy for demonstrably safe operations, production DB migration exercise and fault-injection/real-provider E2E tests.
- Phase 2 missing independently source-verified scientific claims, retrieval-grounded LLM reasoning and quantitative evaluation across all 13 specialized agents, customer/portfolio/product authority adapters, other sector feeds, scheduled monitoring, source licensing reviews, trained quality benchmark sets, promotion/rollback of evaluated skill versions and realistic campaign performance feedback loops.
- No publishing, messaging, CRM mutations, ad spending or independent self-upgrade permitted.
- Production OIDC remains mandatory; Microsoft Entra configuration is deliberately deferred per previous direction.
- CI success is a prerequisite, not proof of live production readiness.

## Suggested manual E2E acceptance
1. Run migrations against a disposable PostgreSQL database and seed a verified tenant.
2. Create a Brain run with stable command key; re-submit with a different correlation ID and verify one run; submit with different substantive payload and verify Conflict.
3. Enable worker in a staging instance and verify exactly one CAS claim across two replicas; inspect 13 agent executions, stage handoffs and final REVIEW_REQUIRED.
4. Terminate worker between execution and checkpoint; verify no replay, stale quarantine only by manager with documented reason, audit entry and NEEDS_INTERVENTION.
5. Discover a Europe PMC topic; verify fixed-host read-only request, quarantined signal, provenance, deduplication and no independent-verified claim.
6. Review signal; verify trend summary preserves human-reviewed-not-independent-verified distinction and evidence refs.
7. Propose existing capability; run built-in regression; human decide; verify APPROVED_FOR_CODE_RELEASE does not change runtime capabilities.
8. Verify unauthorized viewers, cross-tenant operators and untrusted sources are blocked.
