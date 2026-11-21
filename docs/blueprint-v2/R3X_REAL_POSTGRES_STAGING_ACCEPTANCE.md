# R3-X — Real PostgreSQL cross-engine acceptance and offline staging preflight

**Implemented 21 November 2026. Release verdict: NOT_CERTIFIED.** No real external provider accounts, MS Entra environment, model API credentials, publishing account, customer recipient, production tenant, SMTP system or internet publishing are connected. No live platform authorization is attempted.

## Reuse Map

| Domain | Single existing owner retained | R3-X improvement |
| --- | --- | --- |
| Identity, tenant and RLS | Existing organization/user, Prisma transaction-local context and FORCE RLS | Test two genuinely separate tenant datasets under migrations in disposable PostgreSQL |
| Campaign, objective, workflow and brain authority | MarketingReadService, CampaignService, WorkflowService and Brain ledger | Verify that read model never forges workflow, approval, agent research or other tenants' context |
| Brand and creative governance | BrandMasterService, CreativeAssetService, ApprovalService | Test approved brand source, denied foreign rules, exact-approval missing publication |
| Social and audience | CampaignPublicationService, SyntheticAudienceEmailService | Test refusal of no-approval publication, denial of PII, foreign user and unapproved consent; zero external sends |
| Research and learning | MarketingLearningService | Verify source reference policy and quarantined evidence; no implicit learning promotion |
| Metrics and causality | MarketingPerformanceService | Real SQL composite tenant scope, source idempotency, collision, independent human review, audit once, precise integer KPI arithmetic, no fabricated causal attribution |
| FinOps | ModelBudgetService | Deny unprovisioned live model spend, reject illegal reservation, preserve tenant separation |
| Release evidence | Single R3-L 500-case register, R3-N FORCE RLS census, R3-W Chromium evidence and detached production Ed25519 verifier | Same-run R3-X strict Vitest execution verifier and fail-closed disposable staging preflight; no parallel release authority |

## Execution

The **37 new distinct named R3-X cases** in apps/api/src/postgres-r3x-cross-engine-staging.integration.test.ts execute original business services against actual migrated PostgreSQL with two disposable organizations and distinct identities. They cover tenant isolation (7), workflow projection (4), agent context (3), brand (3), social (3), synthetic email (3), research (2), metrics (9), FinOps (3). They are not mocked responses and are never converted to independent E2E signoff.

The suite runs inside both the ordinary application test suite and a dedicated isolated Vitest JSON-report invocation, which prevents a fake marker in source from sufficing. scripts/quality/r3x-postgres-evidence.mjs independently checks **all 37 actual per-case passed results** from that JSON, excludes skips/failures/duplicates and records SHA-256 of source and reporter bytes. Its own negative unit tests detect forged or missing reports.

scripts/quality/r3x-staging-preflight.mjs refuses all databases other than the exact localhost marketing_test PostgreSQL in CI, production process context, real social/AI/SSO/email credentials, and enabled external-effect flags. It requires the **same-run** actual PostgreSQL FORCE RLS census proving 46/46 tenant-owned tables. It records safety status without including the database password or pretending to have checked a production environment. The canonical index additionally cross-checks its GitHub run ID and digest against the 37-case execution manifest.

## Honest completeness after verified CI

- 123 offline/unit/BFF assertions
- 91 actual PostgreSQL integration assertions (54 existing + 37 R3-X)
- 51 real Chromium browser cases over encrypted Next BFF and a synthetic-only API
- **265 mapped of 500 planned engineering cases, 235 not mapped**
- **0 independently signed production-like staging E2E cases**

The production release gate is intentionally NOT_CERTIFIED. Next required work is a genuine independent staging environment with deployed live API under controlled test-only OIDC configuration, least-privilege runtime database role, separate operator signoff and pentest/DR; later, with explicit authorization, legitimate provider staging credentials and entitlement checks. These are not established by this tranche.
