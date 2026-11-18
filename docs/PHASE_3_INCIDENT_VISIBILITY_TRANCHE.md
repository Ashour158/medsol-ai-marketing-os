# Phase 3 — Incident visibility and controlled investigation

## Reuse Map
- **Incident authority:** `BrainRun` and `OutboxEvent` remain the only state owners; no incident table, timer service, event bus or recovery engine is introduced.
- **Read model:** existing `MarketingCommandCenterService` composes tenant-scoped counts and paginated incident queries.
- **Authorization:** existing `BootstrapAuthGuard` + `READ_AUDIT` route registry.
- **Presentation:** existing Operations Console and secured Next.js BFF proxy.

## Changes
1. Snapshot counts now use database counts rather than the capped sample of 20 stale runs, 30 intervention runs and 25 dead letters.
2. Snapshot reports `incidentCoverage` (sample count, full total, truncation) to prevent false impressions of a complete incident list.
3. `GET /marketing/command-center/incidents/:kind?limit=25&cursor=<id>` supports three fixed types:
   - `BRAIN_NEEDS_INTERVENTION`
   - `BRAIN_STALE` (RUNNING without updates for at least 15 minutes)
   - `OUTBOX_DEAD_LETTER`
4. Pagination is capped at 100 items, ordered by timestamp and unique ID, and checked against the requesting tenant and current incident predicate.
5. The web console explicitly displays total versus sampled incidents and adds an incident inventory with load-more controls.
6. Regression coverage checks manager-only access, tenant scope, cursor validation, stable page order and pagination limits.

## Operating policy
- **No automatic retry.** Investigators inspect the authoritative Brain run or outbox state; a stale or ambiguous remote model execution must not be replayed without reconciliation.
- Counts are **observational**, not a guaranteed consistent snapshot of a changing database. If an incident transitions state while paging, the cursor can be rejected; refresh the inventory.
- No outbound pager/email, Slack, Teams or webhook delivery is enabled. CI proves the code path, not production alerting or on-call acknowledgement.
- Quarantine remains the existing explicit audited operator action requiring inactivity and rationale; this tranche does not bypass it.

## Gate before production deployment
- CI tests, typecheck and build must pass.
- Stage in a disposable tenant database with OIDC and realistic failure injection; confirm no cross-tenant incident leakage.
- Add authenticated alert delivery, paging acknowledgement and on-call escalation only after destination, privacy and consent review.
- Validate service-level monitoring and distributed worker crash recovery separately. Entra provider registration remains deferred.
