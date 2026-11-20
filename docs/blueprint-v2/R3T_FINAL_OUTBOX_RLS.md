# R3-T — Final FORCE tenant RLS and canonical durable outbox dispatch

**Implementation scope:** the existing `OutboxEvent` and authoritative delivery workers, not a second publishing service. External provider accounts and remote customer effects stay disabled.

## Reuse Map (mandatory)
- `PrismaService.withMarketingTenant`: only tenant transaction boundary; non-BYPASSRLS production role mandatory.
- `OutboxPublisherService`: the sole CAS claim / attempt / final acknowledgment / dead-letter owner. Enumerates canonical `Organization` IDs and searches tenant-owned `OutboxEvent` only within tenant transactions. No unscoped global event scans.
- `OutboxService`: transactional enqueue remains owned by caller's existing scoped transaction; pending becomes tenant-scoped.
- `DeliveryOperationsService` and `MarketingCommandCenterService`: reuse canonical dead-letter and incident views under scoped read transactions; no copied incident ledger.
- `BrainHandoffConsumer`, `MarketingIncidentResponseService`: no changes to internal event contract or manual recovery fences.
- `R3-N` PostgreSQL census and `R3-L` master 500-case evidence index: extend existing checks and do not declare independent acceptance.

## Security
Migration `20261120080000_r3t_outbox_force_rls` FORCE-protects `OutboxEvent`: exact tenant SELECT/INSERT/UPDATE, no DELETE. The delivery scheduler maintains a round-robin cursor over canonical Organization identities, applies transaction-local tenant scope for each guarded CAS, and uses the same tenant for success/failure updates. The worker never infers external provider delivery from an internal outbox ACK. Replayed deliveries preserve stable event IDs for inbox deduplication and incident investigation.

**CI hard gate:** 34 named FORCE-protected authorities **and zero uncovered tenant tables**, including future new tenant tables. Actual intended R3 tenant census is 46/46; read the generated live disposable PostgreSQL inventory as measured evidence.

## Real PostgreSQL acceptance
- `T01-016`: low-privilege null-context/other-tenant read and mutation denial; immutable deletion and unscoped insertion refusal.
- `T15-027`: two synthetic tenant events, scoped CAS publication with recorded exact-once observed event ID, no duplicate claim, read-only delivery evidence and zero remote publication.
- `T15-028`: bounded failure, durable dead-letter, no automatic replay or external sends.

The canonical 500-case blueprint maps **157 engineering assertions** (111 offline, 46 PostgreSQL), with **343 unmapped planned cases**, and remains **0 independently operator-signed 500-case E2E**. This is full tenant-database-isolation *engineering* only, not independent penetration testing, production DR proof, provider UAT, legal approval, or production certification. Release: **NOT_CERTIFIED**.
