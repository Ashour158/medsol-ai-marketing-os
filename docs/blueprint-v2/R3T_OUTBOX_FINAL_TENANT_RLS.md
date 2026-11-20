# R3-T — Canonical Outbox Tenant RLS and Governed Internal Dispatch

**Engineering tranche, November 20, 2026. Release remains NOT_CERTIFIED.** No real provider accounts, customer messages, external model calls or remote publication are enabled.

## Mandatory Reuse Map

| Concept | Sole authoritative owner | R3-T change |
|---|---|---|
| Event staging, retry, dead letter | `OutboxEvent`, `OutboxPublisherService` | FORCE tenant PostgreSQL RLS, tenant-local CAS claims and acknowledgements, no new ledger |
| Organization discovery and tenant context | `Organization`, `PrismaService.withMarketingTenant` | Bounded canonical tenant scan; transaction-local context, never BYPASSRLS |
| Consumer deduplication | `InboxService`, `BrainHandoffConsumer` | Reuse existing idempotent consumer; no new nervous system |
| Operator delivery reporting | `DeliveryOperationsService`, `MarketingCommandCenterService` | Tenant-scoped read model, dead-letter counters and incident pagination |
| Quality and release | Existing R3-N census, R3-L 500-case evidence | Zero-gap 46-table FORCE RLS census gate and two new real PostgreSQL cases |

Migration `20261120080000_r3t_outbox_rls` applies ENABLE and FORCE ROW LEVEL SECURITY to canonical `OutboxEvent`. Tenant matching is mandatory for SELECT/INSERT/UPDATE, DELETE is denied to the application role. Null tenant context hides all records and refuses writes. The publisher enumerates only existing `Organization` IDs, claims inside tenant-scoped DB transactions, performs the transport call outside DB transactions, and acknowledges/retries using the same trusted scope. External side effects are not automatically presumed idempotent and the existing real-provider hard lock is unchanged.

Actual PostgreSQL `T01-016` checks low-privilege cross-tenant and no-context denial; `T15-026` exercises two-tenant providerless outbox → canonical InboxService internal simulation. CI requires **46/46** relevant tenant tables FORCE protected; it still produces a measured RLS artifact on failure.

One authoritative 500-case register maps **156 engineering assertions (111 offline + 45 real PostgreSQL)** with **344 planned unmapped** and **zero independently signed E2E acceptance cases**. Production deployment privileges, independent pentest, real production PITR/RTO/RPO/restore, legal/consent authorization and provider staging UAT remain open. **NOT_CERTIFIED**.
