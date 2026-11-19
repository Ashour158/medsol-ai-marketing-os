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

## R1C implementation — existing approval owner and creative authority

[Read the full R1C single-owner Reuse Map, SQL invariants, authenticated Creative Governance Studio and negative acceptance tests](R1C_CREATIVE_DAM_EXACT_APPROVAL.md).

The existing `Approval` and `ApprovalService` own decisions for CreativeAssetRevision as well as Campaign. New optional exact-scope fields bind media digest/source, asset revision, brand, policy, destination, audience and schedule. A different human creator/reviewer and independently reviewed, unexpired rights are mandatory. Adding a revised asset or changing the approved Brand Master invalidates an older approval; no new external delivery permission is ever implied.

Both new asset tables use transaction-local tenant context and FORCE RLS. **Existing organization/session is still single-tenant pilot configured and global RLS has not been deployed to all existing tables**. Provider-backed uploads, consent snapshots, platform destinations, customer-ready agency access and staged multi-tenant IAM remain blockers.

## R2 first governed publication vertical slice

[Single-authority Reuse Map, workflow wiring, SQL controls, full PostgreSQL acceptance and live-provider safety gates](R2_GOVERNED_SOCIAL_PUBLICATION_SANDBOX.md).

R2 now has an internal, executable sandbox from approved brand-bound campaign to independently reviewed creative and exact-version approval, publication-intent creation, preflight revalidation, one synthetic receipt and separately reviewed performance evidence. The sole Campaign owner, DAM owner, ApprovalService, OutboxEvent transport, MarketingWorkflowService and MarketingPerformanceService remain unchanged; the only new aggregate is CampaignPublication, the authoritative desired publication action. No live external platform or consent integration exists, and the database schema **prohibits** `PUBLISHED` as a status for this tranche.

Do not reclassify E13/WF social platform delivery as commercially complete: media byte verification, verified provider accounts/scopes, signed webhook receipts, region/consent policy, tenant identity/RLS coverage, real staging and independent product acceptance remain mandatory.


## R2B provider-neutral registration and media readback foundation

[R2B Reuse Map, two new authoritative metadata owners, SQL tenant security, actual-byte checksum verification and R2C release gates](R2B_INTEGRATION_HUB_MEDIA_EVIDENCE.md).

R2B adds IntegrationConnection for tenant/brand platform destination registration (pending only, no tokens, audited suspension/revocation) and VerifiedMediaEvidence for SHA-256 readback attestation through a trusted backend object reader (not exposed via HTTP and no production object store attached). The existing CampaignPublication preflight observes destination and media evidence separately, but its externalReady/externalEffectsAuthorized results remain false. The R2 Command Center shows registrations and proof; real OAuth, content storage, provider transport, webhook signature reconciliation, consent and commercial preflight are still mandatory before customer publication.

## R2C-A provider OAuth/PKCE credential custody — backend foundation

[See implementation, single-owner Reuse Map, SQL and crypto invariants, test evidence and unsatisfied provider gates](R2C_OAUTH_VAULT_FOUNDATION.md).

Added OAuthAuthorizationAttempt and ProviderCredential as bounded child records of existing IntegrationConnection. One-time PKCE states and a trusted exchange broker can encrypt actual returned tokens with tenant/connection/purpose-bound AES-256-GCM, but may **never** confer provider approval or publication authority. An Integration Hub revocation atomically revokes the encrypted credential; token expiry and pending attestation status are visible through read-only tenant-admin health. Existing CampaignPublicationService continues to return externalReady:false while showing whether a received encrypted token awaits verification. OAuth provider adapters, signed callbacks, verified account ownership/scopes, production storage, consent, release preflight and real provider receipts are subsequent milestones.

## R2E-C signed source-event correlation — no remote delivery claim

[Authoritative R2E-C Reuse Map, immutable post-claim digests, canonical reconciliation and negative acceptance](R2E_C_SOURCE_RECONCILIATION.md).

R2E-C extends the existing append-only, QUARANTINED ProviderWebhookObservation to capture tenant/connection-scoped hashed post-add references only after signed Meta raw-body verification. CampaignPublicationService now returns read-only reconciliation through the existing authenticated API/BFF/Studio, reusing exact-version approval, rights and brand gates. No new publisher, parallel receipt ledger or agent authority is introduced.

The database continues to enforce SANDBOX-only PublicationAttempt records and prohibit PUBLISHED. No signed inbound event can prove successful outbound publishing. R2E-C returns zero verified remote receipts and NO_AUTHORIZED_REMOTE_ATTEMPT without real authorized dispatch. Future real ambiguous provider calls must remain OUTCOME_UNKNOWN rather than being blindly retried. Actual remote receipts require R2F verified publishing, destination ownership, provider readback, consent and staging validation.

## R2F-A governed provider publishing release barrier — implemented, external effects remain denied

[Read the R2F-A single-authority Reuse Map, 23 proof gates, commercial policy wiring, schedule mismatch and staging blockers](R2F_GOVERNED_PUBLISHING_RELEASE_BARRIER.md).

The canonical CampaignPublicationService now exposes OIDC-scoped, read-only live-release prerequisites. The shared policy engine checks all twenty-three prerequisites, while server-side code inspects the actual User, creative/Approval, provider connection/credential and immutable media evidence and calls the existing R1 commercial authorization. The current application cannot satisfy entitlement, provider app review/capability, customer ownership, release schedule, consent/region or operator kill-switch controls; there is intentionally **no live external provider adapter or public publish command**. PostgreSQL still enforces SANDBOX-only PublicationAttempt records and rejects a PUBLISHED status. A transport timeout or even an unverified HTTP success is OUTCOME_UNKNOWN with no automatic retry.

R2F-A is an implemented **release barrier**, not live channel delivery. The required R2F-B official provider adapter, verified account and subscription, exact scheduling semantics, atomic attempt reservation, independent provider readback and fully staged signed receipt reconciliation are outstanding.

## R2F-B immutable approval lifetime correction

[Read the R2F-B single-owner Reuse Map, legacy acceptance, source-of-truth and tests](R2F_B_EXACT_APPROVAL_EXECUTION_WINDOW.md).

Corrected the legacy sandbox rule that permitted a human approval to expire before its scheduled publication. ExactCreativeScope, CreativeAssetService, existing ApprovalService, CampaignPublicationService and the Creative Governance Studio now require approval expiry to extend **more than five minutes past** the planned release time. Existing invalid scopes are not modified or silently promoted; independent reapproval with a new exact scope is necessary. No new approval or publishing engine, and all external delivery remains disabled until full R2F credential, entitlement, permission and staging gates.

## R2F-C durable one-use dispatch hold and locked official-adapter port

[Read the authoritative R2F-C Reuse Map, atomic SQL release-fence contract, test plan and R2F-D blockers](R2F_C_ONE_USE_DISPATCH_FENCE.md).

R2F-C extends **existing** CampaignPublicationService and PublicationAttempt to add a permanent, one-use, tenant-admin/OIDC-authorized `RELEASE_FENCE` (outcome BLOCKED), with exact immutable scope, serializable CAS, one audit and one internal Outbox event. The database permits only SANDBOX and non-dispatchable RELEASE_FENCE; REMOTE and PUBLISHED remain forbidden. Signed webhook evidence, sandbox simulation and holds cannot count as remote sends. The Integration Hub's provider-neutral adapter port exists but its runtime gateway is **always locked** and has zero provider network activity, even for forged capability/permit objects. **This is not an authorized remote attempt reservation**: genuine egress must await verified customer account, official app review, entitlement/consent, durable REMOTE state, actual signed provider receipt and staging testing.

## R2F-D durable preauthorization escrow — no authorized remote sending

[Read the R2F-D authoritative Reuse Map, state machine, SQL insertion and expiry controls, security tests and live-provider release gates](R2F_D_PREAUTHORIZATION_RESERVATION.md).

The existing CampaignPublicationService and PublicationAttempt now support a strictly tenant/provider/approval-scope bound, one-use **DISPATCH_RESERVATION** in **AWAITING_AUTHORIZATION**, expiring after ten minutes. A verified active tenant ADMIN/SUPER_ADMIN may stage an internal authorization escrow; transactional CAS records exactly one immutable attempt, AuditEvent and internal OutboxEvent. Same-key replays survive restarts; a different key or unauthorized tenant/provider/scope fails. Stale escrow is identified as **EXPIRED_NOT_SENT** and can only be closed (BLOCKED, no send) by an authorized operator after expiry, never automatically replayed. SQL still forbids REMOTE and PUBLISHED, and the official provider gateway remains hard-locked. A preauthorization escrow is not an authorized outbound reservation or evidence of actual delivery. True R2F-E requires provider app review, customer account ownership, entitlement, consent, a server-minted authorized REMOTE attempt and staged provider GET receipt.

## R2G provider simulation matrix — executable and strictly no-account

[Read the single-owner R2G Reuse Map, twelve failure/success scenarios and verified synthetic-workflow acceptance](R2G_SIMULATED_PROVIDER_MATRIX.md).

The existing CampaignPublicationService sandbox now runs deterministic, source-bound social-provider simulations for every existing Integration Hub catalog provider. This covers synthetic success, rejection, invalid token, rate limiting, timeout, duplicate/early callbacks and readback mismatch. The same tenant-scoped exact approved campaign, creative, PublicationAttempt, audit, outbox, policy and metrics owners are used; no duplicate publishing engine or receipt ledger exists. Real provider calls, receipts, platform metrics and auto retries remain zero, and PostgreSQL continues to prohibit live REMOTE and PUBLISHED. This is a substantial R2 simulation advance, **not R2 completion**; creative production, consent/email, source analytics, multichannel contracts, and staged production acceptance remain pending.

## R3-A — persisted no-effect Blueprint/Workflow Studio simulation

[Read R3-A single-owner Reuse Map, approved DAG traversal, persisted steps, tenant-idempotent acceptance and incomplete R3 requirements](R3A_VIRTUAL_BLUEPRINT_WORKFLOW_STUDIO.md).

The existing Blueprint v2 draft compiler is now paired with a bounded pure DAG simulator, and the **existing** MarketingWorkflowService persists accepted virtual orchestration in WorkflowExecution + WorkflowStepExecution, with OIDC user scoping, tenant-aware replay and exactly one audit/Outbox event. The Command Center has a JSON Blueprint/Workflow Simulation Studio to visualize canonical agent handoffs, fan-out, join, human decisions and scheduled waits, with zero actual agent/model/tool/provider invocations. Unsupported MCP/A2A/domain nodes and external effects are blocked. This provides a demonstrable R3 simulation and governance spine, **not** signed blueprint deployment, full deep agent runtime, working multi-provider model gateway or functional MCP/knowledge fabric. R3 remains partial until those engines and staging tests are implemented.

## R2H executable synthetic Audience/Consent and Email Journey

[Read the R2H authoritative Reuse Map, append-only synthetic consent data, immutable no-send audience snapshots and full PostgreSQL acceptance](R2H_SYNTHETIC_CONSENT_EMAIL.md).

A narrowly bounded **synthetic-only** Audience/Consent owner now creates random anonymous recipient references (no email, name, phone or PII) and appends opt-in, withdrawal and irreversible complaint events. The Email owner builds idempotent SHA-256 consent+campaign+content audience snapshots for a real human-approved Campaign but explicitly never sends any messages. Three additive tenant FORCE-RLS tables, immutable triggers, SQL constraints forbidding SENT/provider receipts, canonical AuditEvent and OutboxEvent integration, OIDC tenant-admin API/Next BFF and a full simulation Studio provide end-to-end verification. E29/E30/WF16/WF17 remain PARTIAL, not commercially complete or legally verified. Real mailing and broader R2/R3 work remain pending and no account connection is required.


## R2/R3 combined hardening tranche — graph safety and remaining acceptance

[Reuse Map, adversarial blueprint graph validation, outstanding R2/R3 functional capabilities and acceptance sequence](R2_R3_BIG_TRANCHE_GAP_AND_GRAPH_SAFETY.md). The existing Blueprint compiler now rejects unreachable nodes, branches without terminal paths, multiple roots and unknown configuration fields. Canonical virtual workflow simulation remains non-executable and cannot send messages or call providers. **Neither R2 nor R3 is declared complete.**

## R2-I and R3-C — synthetic ESP matrix and provider-neutral model routing

[Reuse Map, 12 synthetic email transport scenarios, 4 simulated model-provider protocols, zero-egress guarantees and acceptance blockers](R2I_R3C_SIMULATED_TRANSPORT_AND_MODEL_ROUTING.md). The existing R2H email authority now persists deterministic, scenario-bound no-send transport observations under its original immutable audience snapshot, with SQL guards against fake real sends or retries. The existing GovernedModelService/BoundedModelGateway can opt into four **offline** provider simulations (OpenAI, Anthropic, Gemini, local) with server-configured canonical-agent routing and the original budget ledger; default remains disabled. Neither slice creates external accounts, real email delivery, real AI inference, or full R2/R3 completion.

## R3-D — dormant Anthropic/Gemini official model transport contracts

[Reuse Map, fixed-endpoint transport contracts, strict no-tool output validation, reviewed pricing and no-account acceptance](R3D_MULTI_PROVIDER_MODEL_ADAPTERS.md). The canonical GovernedModelService and BoundedModelGateway now have dormant Anthropic Messages and Gemini generateContent adapters with explicit server-only credential/price gates, no tool calls, no arbitrary endpoints and no automatic retries. CI mock-fetch tests never contact a provider. Default remains disabled and no customer account is connected. This is **not** R3 production provider acceptance.

## R3-E — signed MCP/A2A registration and revocation

[Reuse Map, Ed25519 trusted manifest signature, strict tool/scope declarations, PostgreSQL FORCE RLS, independent approval and permanent revocation](R3E_GOVERNED_MCP_A2A_REGISTRY.md). The new GovernedToolRegistration aggregate owns **metadata only** and reuses existing OIDC, AuditEvent and OutboxEvent authorities. No MCP/A2A network calls or executable tool permissions are enabled. Provider staging, credential custody, remote schema validation, DNS-safe egress and cross-tenant red-team remain R3 exit blockers.

## R2-J — DST-aware, consent-aware virtual email journeys

[Reuse Map, bounded virtual journey DSL, overnight quiet hours, DST handling, rolling frequency caps, immutable audience/creative binding and SQL no-send acceptance](R2J_CONSENT_AWARE_VIRTUAL_EMAIL_JOURNEYS.md). The existing R2H email simulation authority now supports multi-step schedules and all 12 simulated ESP outcomes. This is **not** a legal consent or email delivery system.

## R2/R3 independent internal release acceptance audit — 2026-11-19

[Read the 25-gate evidence review, negative-control regression coverage, P0 blockers and explicit non-certification verdict](R2_R3_RELEASE_ACCEPTANCE_AUDIT_2026_11_19.md). Both releases remain PARTIAL. CI, virtual provider tests and signed MCP/A2A metadata do not prove production provider interoperability, 500-case E2E acceptance, general workflow deployment, hybrid RAG or legal consent. External effects remain locked pending independent customer/provider/security acceptance.

## R2/R3 — offline official-provider wire and OAuth connection trials

[Eight-provider official-shaped wire rehearsal, real model adapter parsing with injected fake HTTP, Meta/LinkedIn canonical PKCE exchange with fake broker, 11-scenario chaos, tenant OIDC/CommandReceipt/AuditEvent, admin trial studio](R2_R3_OFFICIAL_PROVIDER_OFFLINE_CONNECTION_TRIAL.md). This extends the **existing** Integration Hub, OAuth, model router and publishing authorities without a parallel sender or provider connection. Real provider HTTP, real accounts, customer delivery, model inference, MCP/A2A execution and verified receipts remain **zero**. The external staging and security acceptance gates in [the R2/R3 release audit](R2_R3_RELEASE_ACCEPTANCE_AUDIT_2026_11_19.md) are unchanged.

## Six additional offline provider protocols — Instagram, TikTok, YouTube, X, Canva, Adobe

[Reuse Map, ordered upload/post/job/status contracts, 66 new provider chaos cases, 5 fake PKCE flows, Adobe server-to-server fixture, exact HTTP shapes, no-egress checks and remaining official sandbox requirements](R2_R3_SIX_PROVIDER_PROTOCOL_COMPLETION_2026_11_19.md). All **14** provider categories now have in-process trial contract coverage. This is **not** a connected production API adapter release; customer permissions, real binary uploads, application approval, provider callbacks and all cross-channel production R2/R3 acceptance remain unverified. The social/email and tool/model egress locks are unchanged.
