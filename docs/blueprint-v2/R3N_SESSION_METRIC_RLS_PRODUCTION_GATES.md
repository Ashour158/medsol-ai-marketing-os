# R3-N — Tenant-Fenced Sessions, Immutable KPI Evidence & Actual PostgreSQL RLS Inventory

**Date:** 20 November 2026. **Classification:** implemented offline engineering tranche; **R3 NOT CERTIFIED**. No real provider connections, customer accounts, remote MCP/A2A dispatch, model inference, external social publishing, live audience email or commercial billing are authorized.

## Mandatory Reuse Map

| Business concept | Sole existing owner | R3-N change | Explicitly forbidden duplicate |
| --- | --- | --- | --- |
| Trusted PostgreSQL tenant context | `PrismaService` and the preexisting transaction-local `app.marketing_tenant_id` convention | Add shared `withMarketingTenant` infrastructure primitive; fail closed on invalid tenant; use `set_config(...,true)` only inside the transaction | Global `SET` on pooled connections, separate database middleware or user-supplied tenant selectors |
| OIDC identity and revocable sessions | `BootstrapAuthGuard`, `AuthSessionService`, canonical `User`, `AuthSession` and `TenantRolePolicyService` | FORCE RLS on `AuthSession`; scoped register/revoke/guard validation; PostgreSQL terminal-revoke trigger prevents reparenting, expiry mutation, or unrevocation; reuse existing role reassignment session invalidation | New identity/session store, synthetic OIDC users, or JWT trust without current session lookup |
| Marketing metrics and source provenance | Sole `MarketingPerformanceService`, `Campaign`, `MarketingMetricObservation` and existing `AuditEvent` | FORCE RLS on `MarketingMetricObservation`, bounded scoped ingress, idempotent unique source key, same-transaction campaign ownership check, independent review and source-immutable terminal review trigger | Shadow analytics service, independent derived revenue ledger, unreviewed metrics presented as paid-provider truth |
| Release acceptance | Existing `QUALITY_500_CASE_PROGRAM.md` and sole `scripts/quality/r3l-acceptance-case-index.mjs` | Add four named actual PostgreSQL cases and enforce the same 500-slot ledger in CI (141 mapped) | Fabricating 500 passed E2E, rewriting original blueprint case allocation or parallel testing ledger |
| Security coverage evidence | PostgreSQL `pg_class`/`pg_policies`, the existing canonical migration chain and CI artifact pipeline | CI-only exhaustive tenant-column table census with a regression gate on 13 already protected tables and a precise uncovered-table backlog | Inferred/memory-only RLS counts, staging access, or false production penetration certification |

## Database policy and source protection

Migration `20261120020000_r3n_session_metric_rls` adds `ENABLE` and `FORCE ROW LEVEL SECURITY` for the existing `AuthSession` and `MarketingMetricObservation` tables with tenant-local SELECT, INSERT, UPDATE and DELETE policies. **Unscoped PostgreSQL connections return no rows**, and operations cannot obtain another tenant's records merely by guessing a globally unique ID. The R3-M composite `AuthSession(organizationId,userId)` foreign key and the composite `MarketingMetricObservation(organizationId,campaignId)` FK continue to protect same-tenant ownership.

The existing `AuthSessionService` and `BootstrapAuthGuard` use the **shared database-transaction helper**, never a session-global tenant setting. An AuthSession cannot be moved to another user or tenant, have its original expiry rewritten, or be unrevoked; the terminal lifecycle trigger rejects every update except initial revocation.

The existing `MarketingPerformanceService` now groups validation, campaign lookup, duplicate source key detection and metric creation in a **single tenant-fenced serializable transaction**; visibility, grouping and independent human review also use tenant-local scoped reads. SQL rejects forged metric amounts, source systems, record IDs, event timestamps, campaign IDs, submittedBy, createdAt, and post-review rewriting. The only permitted UPDATE is initial `QUARANTINED` to `REVIEWED` with an independent reviewer and timestamp. Existing `AuditEvent` remains the sole operator activity audit ledger. This does **not** mean the source export has been externally validated, attribution proven, or provider billing independently reconciled.

Intentional limitation: Tenant-scoped DELETE remains available at the database level for an eventual governed retention workflow; deletion authorization and preservation of independent evidence require further production-policy work. The database role used for production must be non-superuser and without BYPASSRLS; the CI check verifies only a disposable PostgreSQL instance.

## Real executable PostgreSQL acceptance

`apps/api/src/postgres-r3n-session-metrics-rls.integration.test.ts` adds four separate cases:

- `T01-010`: non-BYPASSRLS role and pooled connections see no unscoped/foreign OIDC session; owner sees only their own; foreign user cannot revoke another session; expiry and terminal unrevocation cannot be altered even by a tenant-owner transaction.
- `T13-002`: low-privilege PostgreSQL SELECT and UPDATE of performance evidence is restricted by tenant; two tenants can import the same source key independently; one tenant cannot forge the other's review, list or campaign aggregate.
- `T13-003`: SQL-level source-value mutation, self-review and post-review reviewer rewriting are rejected; actual `MarketingPerformanceService.review` writes one audit event, preserves figures and refuses false provider verification.
- `T15-022`: two service instances race eight offline imports of one unique source event; exactly one canonical metric observation persists and later retries replay; no model usage, outbox publication or real effects.

All four run against actual PostgreSQL within the existing `pnpm test` gate and are skipped outside the explicitly enabled integration environment. The original 137 mapped engineering cases remain in the existing index, not duplicated. Expected R3-N accounting is **111 mapped offline cases, 30 mapped real PostgreSQL cases, 141 total, 359 unmapped planned slots, zero independently accepted 500-case E2E cases**.

## CI PostgreSQL security inventory

`scripts/quality/r3n-tenant-rls-inventory.mjs` only runs with explicit `MARKETING_R3N_RLS_CI_ONLY=1`, `CI=true`, `GITHUB_ACTIONS=true`, `MARKETING_DB_INTEGRATION=1`, numeric Actions run ID and exactly the disposable `marketing_test` database/user on `localhost:5432`. It queries actual `pg_class`, `pg_namespace`, `pg_attribute` and `pg_policies` for every public base table containing `organizationId` **plus the existing dual-tenant `AgencyGrant` table** (which uses `clientOrganizationId` and `agencyOrganizationId`). It checks all **13 specified previously FORCE-protected authority tables** still have enabled, forced RLS and at least one policy. No live business data, secrets or raw backups are read or exported.

The artifact `r3n-rls-inventory.json` reports actual tenant-table count, forced-policy count, named uncovered tables, highest-risk unprotected domains and a **NOT_CERTIFIED** verdict. The authoritative 500-case evidence index must reference the *same Actions run ID* and a passing inventory before it can report the 141 mapped engineering assertions as CI-asserted.

This is a measured, staged RLS rollout, **not** a claim that 100% of database tables are protected. The backlog will include any uncovered core business tables until explicitly migrated with compatible service/worker transactions and real low-privilege tests. A missing mandatory FORCE RLS table is a CI failure.

## Release gates and outstanding enterprise blockers

Successful PR CI must validate strict TypeScript, a clean PostgreSQL migration, historical non-destructive upgrade, no Prisma drift, all existing web/packages/API tests, the new R3-N PostgreSQL cases, actual low-privilege policy probes, same-run RLS census, the R3-K isolated PostgreSQL dump-and-restore evidence, source reference checks and SBOM/dependency audit evidence. Build and test must pass at the exact PR head SHA before squash merge.

**R3 remains NOT CERTIFIED.** Remaining launch gates include the uncovered RLS tables and tenant-safe background workers, full independent 500-case end-to-end execution and signoff, production backup/PITR/RTO/RPO and regional failover, independent pentest and threat review, long-term evidence retention, real provider staging UAT only when separately authorized, operational alerts and customer/agency UAT. No real accounts are connected or touched by this tranche.
