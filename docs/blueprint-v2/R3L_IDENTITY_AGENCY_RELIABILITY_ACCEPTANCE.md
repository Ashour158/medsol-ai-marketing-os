# R3-L — Identity-Fenced Agency Grants, Multi-Worker Resilience and 500-Case Evidence Index

**Date:** 19 November 2026. **Release classification:** offline engineering tranche, **R3 NOT CERTIFIED**. Real social/ESP/model accounts, remote tools and customer publishing remain disconnected. This is neither production security certification nor independent completion of the 500 enterprise E2E cases.

## Mandatory Reuse Map (one authoritative owner per concept)

| Concept | Existing authoritative owner | This tranche | Explicitly forbidden |
|---|---|---|---|
| Tenant, identity, OIDC, assigned role | Existing `User`, `TenantRolePolicyService.assertActorPermission` and `BootstrapAuthGuard` | Require a verified OIDC actor at every delegation lookup; reuse current custom-role restrictions | Agency shadow user table, trust in user ID submitted in API body |
| Client brand | Existing `Brand` owned by `TenantBrandService` | Revalidate actual live brand before granting an agency read-only operation | Second brand registry, inferred brand membership |
| Agency delegation | Existing `AgencyGrant` and `TenantBrandService` | **FORCE RLS** for client/agency visibility, client-only mutations, irreversible revocation trigger, existing audit stream; no additional grants table | Standalone agency auth service, delegated publish/tool/model power |
| Multi-worker delivery, exactly-once audit | `OutboxPublisherService`, `BrainHandoffConsumer`, `InboxEvent`, `AuditEvent` | Race two worker instances, prove stable event-ID dedup after simulated commit/ack crash; test cross-tenant failure/dead letter | Second outbox/inbox or untracked retry daemon |
| Incident ownership | `MarketingIncidentResponseService` and canonical `BrainRun`/`OutboxEvent` | Test bounded retry limit and incident escalation for a failed internal event | New incident status store or autonomous replay of ambiguous effects |
| Release acceptance | `QUALITY_500_CASE_PROGRAM.md` | Register all 500 planned slots, execute 110 named **offline unit** assertions and three named **real PostgreSQL integration** cases, record evidence in CI | Claim that the 500 E2E program is complete; fabricate test/signoff outcomes |

## Database hardening

Migration `20261119233000_r3l_agency_grant_rls` adds PostgreSQL `FORCE ROW LEVEL SECURITY` to the **existing** `AgencyGrant` table: no session tenant context yields zero rows, the client or matching agency tenant may see its grant, and only the client tenant may create or update it. A database lifecycle trigger rejects physical deletion, modification of original scope/actions/expiry/provenance and attempts to resurrect a revoked relationship. Revocation stays the one existing CAS-fenced, audited transition via `TenantBrandService.revokeAgency`.

Existing service methods `grantAgency`, `listClientGrants` and `revokeAgency` now set trusted transaction-local `app.marketing_tenant_id` before touching grants. `resolveAgencyReadScope` no longer accepts a caller-asserted agency user ID: it accepts `VerifiedIdentity`, checks current OIDC subject, active user, built-in role and optional restrictive tenant role through **the existing** `TenantRolePolicyService.assertActorPermission`; then verifies live grant, expiry, allowed action and client brand inside a tenant-fenced serializable read. The only mapped actions are `CAMPAIGN_READ` → `READ_PORTFOLIO`, `ASSET_DRAFT` → `MANAGE_CAMPAIGN`, `REVIEW_COMMENT` → `READ_APPROVALS`, `REPORT_READ` → `READ_AUDIT`. The decision never enables publishing, email, paid ads, tools, models, tenant impersonation or credential access.

The real PostgreSQL tests cover OIDC impersonation, missing/stale role, role downgrade and disable, inactive/expired/revoked grant, foreign client brand, duplicated relationship, terminal revocation, two-way grant visibility, unknown tenant, client-only DB update policy, invalid immutable update and isolation under a non-BYPASSRLS principal. **Grant lookup is read-only evidence**, not a replacement for a resource-specific agency endpoint or a transactional final read check. No new external-effect permissions are granted.

## Resilience acceptance

`postgres-r3l-multiworker-resilience.integration.test.ts` runs two real PostgreSQL-backed outbox publishers and six racing batch calls against internal Brain handoff events for two synthetic tenants. It creates durable consumer proof **before** a corresponding outbox acknowledgment to simulate the crash window; subsequent delivery must replay the stable event ID without adding another inbox/audit record. A deliberately forged cross-tenant aggregate must fail, reach bounded dead-letter state after eight attempts and produce an internal incident alert. All work is entirely local, with zero model-provider charges or actual customer sends.

Exactly-once **real-world** network delivery is NOT claimed. The test proves CAS claim and transactional inbox/audit dedup for the existing internal consumer. If a future external provider accepts a request before a crash, external idempotency/readback requirements remain separate launch blockers.

## 500-case evidence index: distinguish assertions from enterprise acceptance

The existing blueprint allocation (16 suites, 500 eventual cases) remains fixed. `apps/api/src/fixtures/r3l-acceptance-reference-set.json` contains 110 individually numbered, exact-input, expected-outcome synthetic security and resilience reference cases; `apps/api/src/r3l-acceptance-reference-set.test.ts` executes them against the actual policy/tool/memory/retry functions. Cases cover:
- T02: 30 IAM role and permission boundaries.
- T03: 20 forbidden privileged HTTP routes.
- T06: 20 untrusted MCP/A2A tool-origin metadata samples.
- T07: 24 adversarial source-text strings.
- T15: 16 bounded backoff cases.

In addition, the new real PostgreSQL integration cases are `T01-001`, `T01-002` and `T15-017`. The CI tool `scripts/quality/r3l-acceptance-case-index.mjs` builds a complete 500-slot, stable, non-certifying index, checks evidence IDs, validates the 110-case reference runner and three exact DB test markers, and only labels them **CI_ASSERTED** after the CI `pnpm test` step succeeds. It will publish `r3l-acceptance-evidence.json` through the GitHub Actions artifact pipeline. **113 mapped engineering assertions, 387 as-yet-unmapped planned cases; 0 independently accepted end-to-end cases.** Unit and integration cases do not count as independently signed E2E completion.

## Required acceptance and remaining hard gates

PR must pass strict TypeScript, PostgreSQL clean/history migration rehearsals with zero schema drift, all existing tests, the R3-L actual PostgreSQL cases, the 110-case reference set, the R3-K disposable restore drill, project build and dependency/SBOM evidence collection.

Additional production blockers remain: finished 500 end-to-end human/operator scenarios, independent pentest, full least-privilege RLS coverage for all domain tables (notably broad Brand ownership), secure delegated resource reads behind approved APIs, real provider staging credentials and integration only when separately authorized, failover/PITR/RTO/RPO proof, inaccessible/expired retention, at-least-once external receipt reconciliation, and customer/legal/consent/agency UAT. `R3 NOT CERTIFIED` is non-waivable from this index.
