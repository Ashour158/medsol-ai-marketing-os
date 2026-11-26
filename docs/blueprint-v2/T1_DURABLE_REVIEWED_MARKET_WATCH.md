# T1 — Durable reviewed-evidence market watch (WF36)

## Reuse map
Existing MarketingLearningService, LearningSignal/KnowledgeDocument evidence and market-signal-diagnostics remain the single learning and evidence authority. The watch record stores configuration, bounded signal IDs and last evaluation; prior evaluations are recorded in the existing AuditEvent ledger. No duplicate evidence collection, model, worker, or provider account. Existing IAM permission function, OIDC guard and BFF are reused.

## Implementation
- Exact normalized topic and sector, one watch per tenant and topic/sector, configurable 24/72/168-hour interval, bounded 100-watch registry.
- Active watch due immediately on creation; subsequent due time from actual evaluation time. Manual run only when due. Pause and resume; resume becomes due immediately.
- Exact-topic query before limit; reviewed signal registry and valid linked documents only; excludes future observations, revoked/expired linked documents, other tenants and unrelated topics. Fail closed if more than 200 matches. Compare IDs against last snapshot (not global capped registry). Signals added/removed and coverage/freshness are not market facts.
- Serializable CAS, versioned transitions, immutable configuration and due constraints in PostgreSQL, FORCE RLS with no DELETE path. Audited manager actions via restrictive IAM. UI for creating, evaluating, pausing and resuming. No live acquisition, automatic scheduled execution or external provider claims.
- Actual database test covers duplicate registration, early/stale actions, cross-tenant isolation, evidence delta, rehydration, audit and unprivileged RLS. Full CI required before merge. NOT_CERTIFIED.

## Remaining WF36 gates
Governed acquisition and lawful source rights, scheduler/worker operation and recovery, evidence verification, notification and export, independent acceptance. This is persistent manually evaluated scheduling state, not autonomous monitoring. Tranche 1 remains open.
