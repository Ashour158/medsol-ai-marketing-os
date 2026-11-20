# R3-S — Forensic Event, Inbox, Command & Incident FORCE RLS

**Scope:** four existing tenant-owned tables. **Release remains NOT_CERTIFIED**. No provider accounts or remote sends.

## Mandatory Reuse Map
- Tenant scope: ONLY existing `PrismaService.withMarketingTenant` and transaction-local `app.marketing_tenant_id`.
- Campaign idempotency: ONLY existing `CampaignService` / `CommandReceipt` authority; no new ledger.
- Maker-checker history: ONLY `ApprovalService` and append-only `AuditEvent`; no mutation authority added.
- Durable inbound deduplication: ONLY existing `InboxService` and `InboxEvent`; require verified tenant for both completion and failure.
- Incidents: ONLY `MarketingIncidentResponseService` and `IncidentResponse`; preserve manual intervention.
- Acceptance: the canonical R3-N PostgreSQL census and R3-L 500-case index; no second evidence store.

## Migration
`20261120070000_r3s_event_incident_rls` FORCE protects `AuditEvent`, `CommandReceipt`, `InboxEvent` and `IncidentResponse`. All allow exact-tenant SELECT/INSERT; only inbox and incident metadata permit exact-tenant UPDATE. DELETE is forbidden in all four. No privileged production role or global session-level tenant state is allowed.

Every previously unscoped campaign/approval replay lookup now uses `withMarketingTenant`. `InboxService` requires tenant scope to complete/fail and uses exact id+tenant CAS. Existing transactional outbox and audits remain unchanged.

## Actual PostgreSQL engineering gates
- `T01-015`: non-BYPASSRLS four-table tenant reads, empty context, pooled reset, mutation/DELETE refusal, wrong-tenant boundaries.
- `T03-023`: canonical campaign command replay is idempotent across scoped command receipt, audit, and internal outbox with no remote effects.
- `T15-025`: canonical inbox deduplication, completion and failures enforce verified tenant context.

Expected RLS census **45/46** tenant-relevant tables FORCE protected with only `OutboxEvent` remaining (pending R3-T). CI must prove the actual counts; this is not a declaration of release. Single 500-case register target **154 engineering assertions**, **346 unmapped**, **0 independently signed 500-case E2E**. Independent prod pentest, production DR/PITR/RTO/RPO, real provider UAT and legal signoffs remain unsatisfied.
