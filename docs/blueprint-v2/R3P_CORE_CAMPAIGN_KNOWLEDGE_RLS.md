# R3-P — Core Campaign, Brand Rules, Catalogue & Learning FORCE RLS

**Targeted engineering tranche, 20 November 2026.** This is not production certification and does not enable provider accounts, actual model calls, remote MCP/A2A, social sends or real marketing email.

## Mandatory Reuse Map

| Concept | Sole existing canonical owner | Change | Forbidden |
|---|---|---|---|
| Tenant context | `PrismaService.withMarketingTenant` / transaction-local `app.marketing_tenant_id` | Reuse existing transaction-local scope for every affected operation; never global SET | Duplicate middleware, request-body tenant selection, session pool contamination |
| Objectives and products | `MarketingCatalogService`, `MarketingObjective`, `MarketingProduct` | FORCE RLS SELECT/INSERT/UPDATE, no DELETE, use scoped catalogue creation and read model | Separate marketing product authority or ERP/PIM overwrite |
| Campaign authority and delegation | `CampaignService`, `Campaign`, existing `AgencyGrant` | FORCE RLS owner writes, delegated read only for active, unexpired **CAMPAIGN_READ** grant matched by exact brand; transition uses existing tenant-scoped transaction | Parallel campaigns, generic agency permission to mutate client work |
| Brand Master revisions | `BrandMasterService`, `BrandMasterRevision` | FORCE RLS owner-only; scoped read, proposal, independent review; no DELETE | Shadow brand rules or brand approval bypass |
| Knowledge signals and skills | `MarketingLearningService`, `SkillReleaseService`, `LearningSignal`, `AgentSkillProposal` | FORCE RLS owner-only; reuse existing `knowledgeTx` and skill evaluation, composite evidence FK | Cross-tenant skill sources, automatic unreviewed skill deployment |
| OIDC/view authorization | Existing guard, roles, `MarketingReadService` | All catalogue, campaign and operational read model methods use the same trusted tenant context; keep explicit HTTP permission policy | Authorization by tab visibility or caller-injected tenant |
| Runtime role safety | Existing `PrismaService`, deployment env | Production start refuses `SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB` runtime DB roles | Production Prisma using migration-owner credentials |
| CI & acceptance | Existing `r3n-tenant-rls-inventory.mjs` and one `r3l-acceptance-case-index.mjs` | Expand actual FORCE RLS regression baseline from 13 to 19, four separate real PostgreSQL cases | Fake 500 signed E2E, parallel evidence ledger |

## Implemented SQL boundary

Migration `20261120040000_r3p_campaign_catalog_learning_rls` applies `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` to **six existing authoritative tenant tables**: `MarketingObjective`, `MarketingProduct`, `Campaign`, `BrandMasterRevision`, `LearningSignal`, `AgentSkillProposal`. Missing or blank transaction-local `app.marketing_tenant_id` denies reads and writes to these tables. Tenant-owned tables permit owner-tenant SELECT, INSERT and UPDATE under the existing service authorization. DELETE is intentionally not enabled for these business facts; status transitions or governed retention services must be designed rather than deleting evidence silently.

The `Campaign` SELECT policy permits **only**: owner tenant, or a delegated agency whose live, nonexpired `AgencyGrant` matches the campaign's tenant and brand and explicitly includes `CAMPAIGN_READ`. No agency INSERT, UPDATE or DELETE permission is created. This is a second database-level guard behind `TenantRolePolicyService` (live OIDC and roles), not an alternative app-side grant owner.

Added composite FK `AgentSkillProposal(organizationId,evidenceSignalId) → LearningSignal(organizationId,id)` plus matching Prisma relation. Historical cross-tenant/orphan links fail migration; there is **no silent source rewrite**. `AgentSkillProposal.agentId` is deliberately not FK-linked to an installed Agent because proposals may target built-in uninstalled roster capabilities; only existing signed roster capabilities can be approved after regression.

## Execution and low-privilege acceptance

The existing `MarketingReadService` now runs all relevant catalogue, campaign and operator projections using transaction-local tenant context, including the R3-O offline journey projection. `CampaignService.transition`, `MarketingCatalogService`, `BrandMasterService`, `MarketingLearningService`, `SkillReleaseService` use existing scoped transaction primitives. The startup role check is deliberately enabled only when `NODE_ENV=production` to keep CI migration and disposable drill accounts separate; the **real runtime must be deployed with distinct nonprivileged PostgreSQL credentials**.

New actual PostgreSQL cases:

- `T01-011`: six-table low-privilege role isolation; missing tenant, switching tenant and pooled context reset; unscoped INSERT refusal; cross-tenant proposal evidence FK denies even migrator-level attempted source graft.
- `T01-012`: agency SELECT permitted only for one brand via active CAMPAIGN_READ, not another brand; agency UPDATE forbidden; revocation hides campaign immediately.
- `T07-026`: existing learning ingest/review/trend/proposal/fixed regression evaluation under tenant scope; no autonomous activation or borrowing foreign signal.
- `T08-032`: existing objective, reviewed brand master, campaign create/transition and read model under tenant context; foreign campaign access denied.

The canonical 500-case blueprint register is expected to reach **146 mapped engineering assertions**: 111 offline, 35 real PostgreSQL, 354 unmapped, and **zero independent operator-signed 500-case E2E tests**. The actual disposable PostgreSQL census should change **from 25/46 to 31/46 FORCE RLS**, leaving **15 uncovered**. These are acceptance targets until exact CI evidence verifies them, **not** blanket claims of production isolation.

## Remaining release blockers

The 15 uncovered tenant-owned models are still launch blocking. Particularly workflow/agent execution, immutable approvals, outbox/inbox, audit, privileged IAM and global background workers must use explicit low-privilege, tenant-scoped transactions before their FORCE RLS migration can be considered complete. The runtime production database principal must remain separate from the privileged migration account; the CI success of a superuser-owned database does not prove application role isolation. The R3-O offline journey can operate in a disposable environment, not automatically as customer-ready SaaS.

Release verdict remains **NOT_CERTIFIED**, independently executed 500 E2E cases **0**, independent production pentest **not performed**, actual production PITR/RTO/RPO **not certified**, real provider UAT **not performed** by design, no real external effects.
