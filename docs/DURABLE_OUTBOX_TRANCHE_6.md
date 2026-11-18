# Tranche 6 — Durable Outbox Delivery and Recovery

## Implemented
- Fixed the Tranche 5 TypeScript failures in workflow step lease call sites and the existing workflow recovery test constructor.
- Extended the authoritative `OutboxEvent` record with `nextAttemptAt` and `deadLetteredAt`, plus a PostgreSQL migration.
- Delivery attempts now use bounded exponential backoff (starting at 1 second, capped at 1 hour), maximum eight attempts, and dead-letter terminal status.
- Claims exclude published, dead-lettered, not-yet-due, and maximum-attempt records; compare-and-swap publishing ownership remains in place.
- Failed deliveries record a bounded error message; successful deliveries clear retry scheduling and acknowledge the same event ID.
- Read-only tenant-scoped delivery operations service exposes pending, retrying, and dead-letter counts and a limited dead-letter list.
- Delivery diagnostics are restricted to `READ_AUDIT` roles. No replay or mutation endpoint is exposed.
- Added automated tests for backoff, dead-letter behavior, stable event identity, tenant isolation and audit permissions.

## Safety boundaries
- Event delivery is **at least once**, not exactly once. Transports may succeed before acknowledgement, so consumers MUST deduplicate on organizationId + eventId using the inbox.
- A transport adapter and background scheduler are NOT wired to production. `publishBatch` must be invoked by a controlled worker with an approved transport.
- No operator replay endpoint is enabled until an append-only replay audit record, role-based approval, and payload inspection workflow exist.
- Workflow leases are integrated into orchestration, but individual campaign side effects are not yet fully transactionally fenced; automatic RUNNING takeover remains disabled.
- An exhausted attempt that crashes before the failure update can remain unmarked; add an expired-lease dead-letter sweeper before production activation.
- Microsoft Entra and live model-provider configuration remain deferred. No production auth bypass or autonomous publishing.

## Next release gates
1. Worker bootstrap with approved transport, heartbeat, bounded concurrency and graceful shutdown.
2. Expired claim sweep and operator-approved dead-letter replay with immutable audit and idempotency.
3. Consumer inbox transactionality and per-command fencing across campaign and external connectors.
4. Staging database migrations, end-to-end event delivery, duplicate transport fault injection and security validation.
