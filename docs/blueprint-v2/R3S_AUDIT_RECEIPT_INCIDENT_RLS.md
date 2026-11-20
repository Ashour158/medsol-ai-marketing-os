# R3-S: Auditable Command, Event and Incident Isolation

**20 November 2026. NOT_CERTIFIED — no real provider account, message or model inference.**

## Mandatory Reuse Map

| Business concept | One canonical owner | Extension |
|---|---|---|
| Tenant isolation | PrismaService.withMarketingTenant | Same transaction-local trusted tenant context, no new middleware |
| Immutable action history | AuditEvent / existing canonical service writes | FORCE RLS SELECT and INSERT only; no application UPDATE/DELETE |
| Idempotency | CommandReceipt, CampaignService, ApprovalService | FORCE RLS and tenant-local preflight receipt reads; never shadow receipt authority |
| Incident intervention | IncidentResponse, MarketingIncidentResponseService | FORCE RLS scoped SELECT/INSERT/UPDATE, no DELETE; incident episodes, maker-checker, and internal alert reservation unchanged |
| Test and release evidence | Existing R3-N PostgreSQL inventory and R3-L 500-case index | 32 named guarded tables, 154 mapped engineering assertions, 0 independent operator-signed E2E |

## Security invariants

Migration `20261120070000_r3s_audit_receipt_incident_rls` enforces PostgreSQL RLS on `AuditEvent`, `CommandReceipt`, and `IncidentResponse`. Runtime with no current tenant context sees no rows and cannot write. Runtime roles must remain non-superuser and non-BYPASSRLS. Direct SQL UPDATE/DELETE of audit facts and idempotency receipts is intentionally denied. The existing incident response state can be amended under single-tenant CAS but cannot be deleted. PostgreSQL superuser and migration-owner access are **not** counted as application isolation proof.

Preflight command receipt reads in `CampaignService` and `ApprovalService` now use `withMarketingTenant`. Their subsequent atomic transitions, human approvals, audit creation and outbox staging remain in the same canonical existing transactions. `MarketingIncidentResponseService` already used tenant-scoped response and alert operations and is not replaced.

## Actual PostgreSQL acceptance

- `T01-015`: low-privilege two-tenant row isolation on three models, blank context reset, no cross-tenant incident update, no audit/receipt DELETE or unscoped INSERT.
- `T03-023`: canonical CampaignService idempotent replay with one immutable CommandReceipt, one AuditEvent and one internal OutboxEvent, no foreign-tenant preflight visibility.
- `T15-025`: canonical incident episode, one durable alert and one human acknowledgement, no replay of uncertain brain run and no remote publication.

The expected measured tenant FORCE RLS census after R3-Q/R is **44 of 46**; outstanding `InboxEvent` and `OutboxEvent` require the separate R3-T worker refactor. The existing 500-case register now maps **154 engineering assertions (111 offline, 43 PostgreSQL)** with **346 planned unmapped** and **zero independently executed, signed E2E**.

## Remaining barriers

Outbox/inbox database tenant isolation, authenticated distributed scheduler account authorization, production low-privilege rollout, independent security/pentest, signed 500 browser E2E, production PITR/RTO/RPO, real provider staging UAT and legal/consent review. External publishing stays hard locked; green CI means engineering evidence, **not** certification.
