# R3-M — Domain Tenant Foreign Keys, Brand FORCE RLS, Resource-Fenced Agency Reads and Executable Acceptance

**Implementation date:** 20 November 2026. **Release status:** R3 engineering tranche, offline-only. **Overall R3 remains NOT CERTIFIED.** No real provider accounts, model inference, remote MCP/A2A dispatch, actual publishing, actual customer email sends, production billing or autonomous skills are enabled.

## Mandatory Reuse Map

| Concept | Sole authoritative owner | R3-M integration | Prohibited duplicate |
| --- | --- | --- | --- |
| Tenant context and human authorization | `BootstrapAuthGuard` (OIDC+session), `User`, `TenantRolePolicyService.assertActorPermission` | Use verified `VerifiedIdentity` from OIDC/session, existing `READ_PORTFOLIO`; verify current tenant role before any delegated read | Agency impersonation, body-supplied user/tenant identity, shadow IAM |
| Client brand registry | Existing `Brand`, `TenantBrandService`, `AgencyGrant` | Introduce FORCE RLS on Brand; owner can write, client and *active scoped agency only* can inspect; transaction-local RLS context | New BrandMaster, independent brand membership or permission ledger |
| Agency-to-client resources | `TenantBrandService` and existing immutable, revocable `AgencyGrant` | `delegatedCampaigns` checks current OIDC role, locks current grant with `FOR SHARE`, verifies live Brand and reads bounded Campaign metadata in one serializable transaction | Authorization probe then unrelated unguarded read; delegated workflow/write/model/publish permissions |
| Campaign and product/objective relationships | `CampaignService`, `MarketingObjective`, `MarketingProduct` and `Campaign` | Change objective/product foreign keys to tenant-composite; campaign command already checked scope, now database verifies it too | Duplicated campaign command handler or client-side-only FK validation |
| Workflow and approval relationships | `WorkflowExecution`, `WorkflowStepExecution`, `ApprovalService` | Rebind workflow/step and approval/workflow FKs to composite tenant+id | Duplicate workflow/approval engine |
| Brain run steps | `BrainRunLedgerService`, `BrainRun`, `BrainRunStep` | Tenant-composite parent/child FK; nested create inherits tenant from authoritative parent (never supplies competing tenant) | Shadow brain or workflow ledger |
| BFF/API routing | Existing `main.ts`, `marketing-permissions.ts`, web BFF route allowlist | Only two GET routes for specific client+brand campaign list/detail; all other verbs remain denied | Generic cross-tenant data proxy |
| QA case index | `QUALITY_500_CASE_PROGRAM.md`, existing `scripts/quality/r3l-acceptance-case-index.mjs` | Extend same 500-slot evidence owner to 136 mapped assertions, including 25 actual PostgreSQL cases and 111 offline unit cases | Fake passed tests or independent-E2E signoff |

## Database isolation and schema constraints

Migration `20261120010000_r3m_core_tenant_fk_brand_rls` adds tenant-composite constraints to five previously ID-only links: `Campaign → MarketingObjective`, `Campaign → MarketingProduct`, `Approval → WorkflowExecution`, `WorkflowStepExecution → WorkflowExecution`, `BrainRunStep → BrainRun`. Necessary composite unique keys are added to existing parents and reflected in **canonical Prisma schema**. All links remain `ON DELETE RESTRICT`. **No historical cross-tenant link is silently rewritten; an invalid legacy row causes the migration to fail safely.** Existing clean and historical-schema migration CI runs must prove compatibility and schema drift absence.

`Brand` now uses `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Its SELECT policy permits the client tenant or an agency tenant only if the *existing* AgencyGrant currently matches this brand, remains `ACTIVE`, has not expired and declares a supported internal action. INSERT/UPDATE/DELETE require the brand's owner-tenant context. Under a low-privilege role, missing or foreign tenant context reveals no brand rows. Brand and agency tenant context is always set **transaction-locally**, not globally on the pooled PostgreSQL session.

**Boundary:** This tranche does not claim all tables in the entire enterprise schema have FORCE RLS. Major other domain tables continue to rely on existing tenant-scoped service queries and composite relationships, pending their own schema-by-schema RLS compatibility and historical-data migration proofs. The eventual full production RLS audit is a separate release gate.

## Resource-specific read endpoint

- GET `/marketing/tenancy/clients/:clientId/brands/:brandId/campaigns`
- GET `/marketing/tenancy/clients/:clientId/brands/:brandId/campaigns/:campaignId`

Both require the existing OIDC/session guard and `READ_PORTFOLIO`. The single authoritative `TenantBrandService.delegatedCampaigns` confirms the authenticated agency actor has the current built-in and optional restrictive role, then opens a **serializable** transaction with agency-local tenant context. It locks the exact `AgencyGrant` with `FOR SHARE`, enforces `CAMPAIGN_READ`, client, brand, active scope and expiry; verifies Brand under FORCE RLS; selects a maximum of 50 metadata-only campaigns, filtered by client tenant and brand. It returns no approval content, creative bytes, contacts, provider credentials, emails, model requests, publishing receipts, audience profiles or finance records. A revoked grant or disabled OIDC user must fail closed; no client-tenant switch is made.

This is a **bounded read endpoint**, not general agency tenant impersonation or delegated ability to mutate the client campaign. It does not certify remote provider authorization.

## Executable real-PostgreSQL and cross-engine evidence

The new `postgres-r3m-tenant-links-delegated-campaign.integration.test.ts` provides three distinct cases:

- `T01-003`: cross-tenant misuse of Objective/Product/Campaign and Workflow/Approval/BrainRunStep references is rejected by actual PostgreSQL constraints, while correct in-tenant creation works.
- `T01-004`: with a genuinely non-BYPASSRLS PostgreSQL role, Brand reads with missing context/foreign tenant fail; owner and approved agency visibility work, agencies cannot update client-owned brands, revocation removes delegated visibility.
- `T01-005`: canonical `CampaignService` creates two brand-bound campaigns and outbox events; authorized agency reads only its approved brand; forged OIDC subject, disabled user, ungranted brand and revoked grant are refused. No real provider calls.

Additional **existing** exercised PostgreSQL journeys are now assigned stable blueprint IDs covering publisher and webhook RLS, tenant/agency revocation, independent campaign/creative approval, signed offline workflows and race fencing, agent identity isolation, governed tool registry, knowledge memory, simulated publication, synthetic email/consent, performance review and incident recovery. Their test logic is reused and not duplicated.

The original 110 explicitly authored offline policy reference cases remain. The reconciliation unit proof `T14-001` is mapped as **offline unit** (not PostgreSQL). The sole 500-case owner, `scripts/quality/r3l-acceptance-case-index.mjs`, now produces a 500-slot index with **111 mapped offline unit cases + 25 mapped real PostgreSQL integration cases = 136 engineering evidence cases** and **364 unmapped planned slots**. This does **not** make any of those 136 independent operator-accepted E2E cases. CI explicitly publishes `medsol-r3m-acceptance-evidence-<run_id>` after the full test gate.

## Proof gates and unresolved readiness

Merge requires successful final-head CI for Prisma client/typecheck, clean and historical migration upgrades, zero drift, **all** Vitest API/web/packages including R3-M cases, extended case-index coverage assertions, the independently rerun disposable R3-K PostgreSQL backup/restore, build, reference-set checks and SBOM/dependency evidence collection. A green SBOM collection job is not vulnerability clearance.

Production remains blocked on independently running and signing all remaining 500 enterprise end-to-end scenarios, full catalog-wide tenant RLS inventory and staged compatible schema hardening, customer onboarding/accessibility UAT, automated DR RPO/RTO and region failover, real provider acceptance in explicitly approved staging (held back by instruction), operational on-call procedures, and independent security/penetration testing. **R3 is NOT CERTIFIED.**
