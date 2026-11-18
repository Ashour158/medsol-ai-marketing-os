# Agentic Marketing & Communications OS — v2.1 implementation control

**Baseline:** Master Blueprint v2.0 plus approved v2.1 amendment. New [v2.1 engine/workflow and depth contracts](MASTER_BLUEPRINT_V2_1_AMENDMENT.md) supersede v2.0 only for amended capabilities; all prior security/owner invariants remain.  
**Code inspected:** `main` at `b1900a7d0aba7e6d12b5a61752dfc7bf98548da5`.  
**Classification:** approved product **target**, not implementation or production certification.  
**Authoritative control:** one concept, one domain write owner; no shadow agents, approval engines, workflow engines, tables, or integrators.

## What has actually been added in this tranche

- `packages/contracts/src/blueprint-v2.ts` — stable, typed **target-state inventory** for E01–E36, WF01–WF41, 13 studios, B01–B10 cognitive roles, and 12 product personas; phased ownership and honest states.
- `packages/contracts/src/blueprint-v2-compiler.ts` — **static, draft-only** graph validation for future Workflow/Blueprint Studio. It does not authorize deployment, run tools, invoke a model, or write business data.
- `GET /marketing/architecture/blueprint` — authenticated `READ_AUDIT` read-only endpoint via existing API and Next.js BFF, available in existing Command Center.
- Regressions covering exact catalog counts, unique IDs, canonical agent aliases, release gates, forbidden external effects, unknown agent IDs, cycles and unbounded tasks.
- Architecture Reuse Map, staged domains and acceptance evidence below.

**Never interpret a target engine/persona entry as an executable capability.** Status stays NOT_IMPLEMENTED, DRAFT_ONLY or PARTIAL until a real owner, authorized API, tests, provider entitlement evidence, staging proof and operator runbook exist. The register is visibility and planning, not a second authority.

## Reuse Map — concrete current owners

| Business concept | Canonical owner to extend | Not permitted |
|---|---|---|
| Agent execution/identity | `packages/agent-runtime/src/roster.ts`, `AgentService`, `AgentExecution` | A second agent roster, agent-owned campaigns, autonomous privilege edits |
| Brain run, team coordination | `BrainRunLedgerService`, `BrainRunExecutorService` | Separate team execution ledger |
| Workflow runtime / lease | `MarketingWorkflowService`, `WorkflowExecution`, `WorkflowStepExecution`, `WorkflowLeaseService` | Parallel workflow state engine |
| Campaign / objectives / product projection | `CampaignService`, `MarketingObjective`, `MarketingProduct` | Marketing overwrite of ERP/PIM inventory/price truth |
| Approval / policy | `ApprovalService`, `Approval`, `packages/policy` | New approval table per integration or agent |
| Brand | `BrandMasterService`, `BrandMasterRevision` | Per-channel shadow brand masters |
| Model routing and cost | `GovernedModelService`, `ModelBudgetService`, `ModelUsage` | Per-agent keys or independent budget ledgers |
| Research and learning | `MarketingLearningService`, `LearningSignal`, `SkillReleaseService` | Unreviewed research silently elevated to facts |
| Analytics | `MarketingPerformanceService`, `MarketingMetricObservation` | Unreconciled connector numbers presented as fact |
| Events/reliability | `OutboxEvent`, `InboxEvent`, `MarketingIncidentResponseService` | New delivery queue for each business feature |
| Tenant IAM | `Organization`, `User`, `BootstrapAuthGuard`, `marketing-permissions.ts` | Client-supplied tenant selection or cross-tenant memberships |
| Social publishing (new authority) | **New bounded domain** for SocialConnection/PublishIntent/Attempt/RemoteReceipt | Let Social agent directly call network |
| Email and consent (new authorities) | **New bounded domains** Audience & Consent; Email & Messaging | Create contact consent inside Email agent |
| Creative/DAM (new authority) | **New bounded domain** Brief/Asset/DesignSource/Rendition/UsageRight | A second brand/file/approval record |
| Subscriptions/agency (new authority) | **Extend Organization; new** AgencyGrant/Brand/Entitlement/Subscription | Allow agency tenant merge |
| Product pricing (new authority) | **Extend MarketingProduct projection; new** finance approved offer | ERP/PIM price overwrite |
| Loyalty (conditional authority) | **New only if native points enabled**; else external projection + intent | Competing financial points ledgers |

## Target-state studios and engines

The typed registry is the machine-readable inventory. All 13 workspaces, 36 logical engines, 41 workflows, 10 cognitive roles and 12 personas are represented **without** creating 33 microservices. The 13 existing registered agents remain unchanged until versioned manifest migration and evaluation.

## Implementation dependency order, no scope cutting

### R0 — Reliability and evidence
- Existing-data migration backup and deterministic expand/backfill/contract rehearsal; Postgres RLS deployment plan and pool reuse adversarial test plan.
- Two genuinely independent Brain workers, SIGTERM/SIGKILL timing, durable outbox acknowledgement and provider billing reconciliation.
- Secrets management, security finding review, signed build artifacts, SBOM, restorability and on-call receiver verification.
- **Exit:** no known critical/high risk breakage, existing-data migration and restore exercise pass; no automatic replay of uncertain effects.

### R1 — Enterprise tenant, brand and governance foundation
- Evolve `Organization` into commercial customer tenancy, with `Brand`, membership, customer-defined role policies and revocable cross-client `AgencyGrant`.
- Policy equation: authenticated tenant + scoped resource/brand + actor role/ABAC + product entitlement + provider capability + data rights + exact approval + available budget + no kill switch.
- OIDC/SSO and future SAML/SCIM, admin re-auth, roles/permissions, workspace Settings and usage/subscription entitlements.
- Extend `Approval` with immutable hash for content, media rendition, audience snapshot/definition, destination, time window, spend, price, policy version and expiry; invalidate on change.
- Introduce DAM asset/source/rendition/license with durable object authorization; asset approval is a command to existing ApprovalService.
- **Exit:** two-tenants plus agency-revoke tests, transaction-local RLS, malicious actor tests, exact version approval denial, consent/external-effect blocked by default.

### R2 — First externally useful campaign
- WF19→WF06→WF07→WF08: brief (text/PDF/DOCX/PPTX/audio where authorized) → evidence → concept/asset → editable source or truthful flattened label → QA → exact approval → social PublishIntent → official eligible adapter → provider reconciliation.
- Add social OAuth/capability registry and one *verified eligible account*. On provider timeout, `OUTCOME_UNKNOWN` and no blind retry.
- WF16→WF17→WF18: marketing contact provenance and consent, suppression, immutable audience snapshot, sender domain auth, ESP send intent, signed delivery feedback, quiet hours, unsubscribe and abuse stops.
- Actual campaign tracking with source timestamps and reconciled post/ESP receipts.
- **Exit:** one eligible external customer end-to-end, never unauthorized post/send or duplicate on retry.

### R3 — Extensible agentic organization
- E27 full model catalog/router: OpenAI, Anthropic, Gemini and approved models via exact tested adapters, tenant privacy, BYOK, capability, budget and fallback policy.
- E28 MCP and A2A registry/gateway with T0–T3 trust, signed metadata, endpoint/credential isolation, schema verification and red-team.
- Agent Studio: signed versioned manifests, 12 UX personas mapped to 13 canonical agents, per-agent missions/non-goals, knowledge, skills, memory, model policy, tools, evidence, KPIs, learning evaluations and rollback.
- Workflow Studio + Blueprint Studio: **same** canonical WorkflowExecution engine, one DSL/IR, editor and prompt builder, static graph checks, simulation, type/policy validation, signed approved deployment, runtime pinning, canary and rollback.
- Knowledge fabric: source/rights/document/chunk/evidence/claim/graph/memory, hybrid lexical/vector retrieval with tenant/brand ACL, deletion and legal holds, red-team leakage tests; evaluated skill feedback.
- **Exit:** safe configurable team execution and tool/model use, no unbounded cycles, tenant leaks or unauthorized external effects.

### R4 — Decision and commercial intelligence
- Market intelligence source policies, approved fetch/crawl, SSRF protection, source snapshots, TAM/SAM/SOM uncertainty, competitor/watchlist and change alerts.
- Product/price: ERP/PIM source precedence, source version/freshness, margin/currency/tax proof, offer and finance approvals, optional authorized price push and reconciliation.
- Loyalty/retention: permissioned segmentation, financial liability/fraud, authoritative points only if explicitly activated, reconciliation.
- Landing pages/forms, first-party conversion events, webinars, ABM and CRM handoff with dedup and audit; attribution vs causality labels, holdouts/experiments.
- **Exit:** source authority preserved, qualified CRM outcome and financial controls proven.

### R5 — Provider/access-dependent expansion
- Paid media launch/pacing with hard spend caps and financial authorization.
- WhatsApp/SMS/RCS/push with separate opt-in/template policies; influencer rights/disclosures; social commerce, customer marketplace and regional enterprise packs.
- **Exit:** provider app-review eligibility, legal scope, reliable third-party receipts, measured cost/profit and operator procedures.

## 17 planned node types (NOT yet runnable)
TRIGGER, CONDITION, TRANSFORM, AGENT_TASK, DOMAIN_COMMAND, MCP_TOOL, A2A_TASK, EVENT_WAIT, HUMAN_TASK, APPROVAL, SCHEDULE, PARALLEL, JOIN, LOOP_BOUNDED, COMPENSATE, ERROR_HANDLER, END.

The static validator accepts valid draft graphs but always returns `deployAuthorized:false` / `executable:false`. Domain, MCP and A2A commands remain blocked pending actual policy-checked runtime support. The graph is not a new executor.

## Before each subsequent tranche
1. Check current `main` and migration history; **write a Reuse Map** mapping new capabilities to current authoritative owners.
2. Define schema, API/event/permission contracts and human acceptance; no new parallel owner if an existing one holds the invariant.
3. Add negative tests for cross-tenant/brand, privilege escalation, revoked access, idempotency, ambiguous provider results and approval invalidation.
4. Implement behind default-deny flag; validate clean and existing-data migration, unit/contract/Postgres integration, UI E2E, provider sandbox.
5. Record test evidence/changed files/known blockers; release behind staged human sign-off and rollback path.

## Non-negotiable deployment blockers
- Production SSO/tenant/agency isolation and RLS not verified.
- Exact-version approval and egress policy not enforced for every external effect.
- No real social/email entitlement, consent/suppression or provider reconciliation.
- Unknown billing not settled against verified provider invoice.
- Multi-worker staging crash, existing-data restore, security/accessibility/UAT acceptance incomplete.
- High severity dependency advisory and GitHub App Checks permissions remain open; do not misread ECC diff-level scores as product readiness.

**Important:** The repository is a working internal governance pilot. This specification and registry are a *development baseline*; most customer-facing engines remain unimplemented.


## v2.1 amendment (approved target and partial executable logic)

[Read the complete consolidated Master Blueprint v2.1](MASTER_BLUEPRINT_V2_1_CONSOLIDATED.md), including the authoritative v2.1 capability, workflow, schema, brain and acceptance amendment.

E34 Search/AI Discovery, E35 Voice of Customer and E36 Corporate Communications extend **existing** Intelligence/Strategy, Social/Community and Content/Brand/Campaign ownership. They do not justify independent agent identities. The ten brains, thirteen canonical agents and thirteen workspaces are unchanged.

WF37 Search/AEO monitoring, WF38 feedback synthesis, WF39 PR releases, WF40 partner enablement and WF41 onboarding extend the workflow target count to **41**. E20/E21 revenue scenario decisioning, E14 authenticity/provenance, sales partner permissions and customer success deepen existing engine responsibilities.

The first v2.1 code implements bounded, review-only decisions in `packages/agent-runtime/src/marketing-expansion.ts` and a **not-yet-integrated** R1 tenant/brand/agency/exact-approval preflight in `packages/policy/src/commercial-scope.ts`. The canonical agent dispatcher returns `expansionReview` only on explicitly provided scoped input. No new external provider connection, creative file authority, IAM migration, customer authentication, media release or revenue attribution is claimed.

**Next R1 implementation** must bind those policy primitives to server-verified tenancy, roles, entitlements, and signed ApprovalService evidence, with PostgreSQL row-level security and two-tenant/agency-revocation tests. External effects remain blocked until all ownership and staging gates pass.


## R1 first executable persistence milestone

[Brand and AgencyGrant source-of-truth, APIs, revocation tests and remaining release gates](R1_TENANT_BRAND_AGENCY_IMPLEMENTATION.md). New records are subordinate to Organization; existing BrandMasterRevision, ApprovalService and User remain their respective owners. Agency relationships are only recorded metadata until server-trusted IAM/ABAC and RLS are enforced. The platform does not accept cross-tenant access from this grant alone.
