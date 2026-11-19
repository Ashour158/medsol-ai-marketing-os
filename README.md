# Medsol AI Marketing OS

Enterprise AI Marketing Operating System for Medsol Corporation.

Current release: v0.2.0 — executable governance vertical slice.

Architecture: Agent -> Policy -> Application Service -> Domain -> Database, with Audit and Outbox attached to authoritative mutations.

Agents do not mutate authoritative business state directly.

Development:
pnpm install
pnpm prisma generate
pnpm typecheck
pnpm test
pnpm build

See docs/architecture/16-executable-vertical-slice.md.
## Blueprint v2.1 target-state development program

The current executable release is a **governed internal vertical slice**; it is not the full customer-facing commercial Agentic Marketing & Communications OS. The approved v2.0 scope and v2.1 amendment is tracked in:

- [Master implementation and architectural Reuse Map](docs/blueprint-v2/MASTER_IMPLEMENTATION_CONTROL.md)
- [Complete consolidated Master Blueprint v2.1](docs/blueprint-v2/MASTER_BLUEPRINT_V2_1_CONSOLIDATED.md)
- [v2.1 change register and engineering contracts](docs/blueprint-v2/MASTER_BLUEPRINT_V2_1_AMENDMENT.md)
- [Deep cognitive Brain and specialist persona charter](docs/blueprint-v2/AGENT_BRAINS_AND_STUDIO_CHARTERS.md)
- [Planned 500-case acceptance matrix](docs/blueprint-v2/QUALITY_500_CASE_PROGRAM.md)
- `packages/contracts/src/blueprint-v2.ts`: all **36 logical engines**, **41 workflow families**, **13 studios**, **10 cognitive roles**, and **12 specialist UX personas** mapped to the existing 13 canonical agents.
- `packages/contracts/src/blueprint-v2-compiler.ts`: **draft-only** node/graph safety lint, not an executable workflow compiler.

Authorized auditors can inspect this target-state inventory from `GET /marketing/architecture/blueprint` in the Command Center. The endpoint and catalog expose **no new external side effects**.

### Release sequence and truth-in-status

R0 reliability and security evidence → R1 commercial tenant/agency/brand/IAM/approval/DAM → R2 real creative/social/email and consent-governed customer campaign → R3 multi-provider, MCP/A2A, Agent/Workflow/Blueprint Studios and knowledge → R4 market/product/pricing/loyalty/conversion → R5 paid media/messaging/commercial ecosystem.

Every engine and workflow has an explicit current status. Names in a target register do **not** mean APIs, agents, integrations, data models, or production security are implemented. No model or agent may authorize its own publication, email send, pricing push, reward, spend, or privilege change. **One business concept has one authoritative owner.**


## R1 first executable tenant/brand slice (not commercial acceptance)

[See R1 tenant Brand and AgencyGrant implementation, security invariants and tests](docs/blueprint-v2/R1_TENANT_BRAND_AGENCY_IMPLEMENTATION.md). Admin-only brand registration and revocable, non-publishing agency scope metadata are now persisted and audited. Current marketing business records and SSO remain tenant-pilot scoped; customer-configurable IAM, PostgreSQL RLS, per-brand approvals, agency user access to business resources and onboarding remain unimplemented release gates.

### ECC repository-level reference evidence vs. per-PR changed-file score

The ECC GitHub App may report `0/7` on a PR that does not change reference files. This is **not** the repository's analyzer/RAG/security score. The authoritative evidence index is [ECC reference readiness](docs/quality/ECC_REPOSITORY_READINESS.md), generated and verified by `node scripts/quality/ecc-repository-readiness.mjs` in GitHub Actions. Seven evidence categories are explicitly scoped and linked, including a maintainer-only, read-only PR review corpus. They do not certify provider interoperability, production security, customer-ready AI or live GitHub Check publication. The ECC app installation owner action is tracked in [issue #3](https://github.com/Ashour158/medsol-ai-marketing-os/issues/3).

### R1C Creative Asset & Exact-Approval Governance

The [R1C creative DAM and exact approval implementation](docs/blueprint-v2/R1C_CREATIVE_DAM_EXACT_APPROVAL.md) extends the existing `ApprovalService` with immutable asset/revision-specific approval scopes and a tenant-RLS asset metadata domain. An authenticated, metadata-only **Creative Governance Studio** appears in the Command Center; it supports creation, version history, independent rights review, exact scope submission and current approval inspection. It does **not** upload verified media bytes, prove editability, verify C2PA signatures or authorize any social/email publishing.

### R2 campaign-to-creative publication sandbox

[Open the R2 governed publication implementation and release gates](docs/blueprint-v2/R2_GOVERNED_SOCIAL_PUBLICATION_SANDBOX.md). This tranche connects existing Brain-led campaigns, tenant Brand, independent human Campaign approval, immutable creative revision rights and exact asset approval into a **tenant-RLS publication intent with a local synthetic receipt**. It adds a Command Center sandbox and uses the existing MarketingPerformanceService for separately reviewed source metrics. It does **not** post to social platforms, send emails, create live impressions/leads or certify media bytes or connected accounts. External effects remain blocked until verified integrations, consent/identity and staging acceptance are implemented.


### R2B provider-neutral integration and media-byte proof

[Read R2B integration architecture, reuse map, security invariants and operational blockers](docs/blueprint-v2/R2B_INTEGRATION_HUB_MEDIA_EVIDENCE.md). New IntegrationConnection metadata records are tenant/brand scoped, explicitly pending, and irreversibly revocable. No social provider credentials or active permissions are stored or claimed. VerifiedMediaEvidence is created only by a backend media reader that returns actual versioned object bytes for independent SHA-256 matching to a CreativeAssetRevision; a production cloud storage reader is not connected yet. The existing publication preflight now reports these evidence types independently while always denying live external publishing. The Command Center has an admin-only Integration Governance Studio. Synthetic sandbox receipts never count as real delivery or marketing metrics.

### R2C-A secure OAuth and provider-token lifecycle

R2C-A adds a server-only [OAuth PKCE / encrypted credential foundation](docs/blueprint-v2/R2C_OAUTH_VAULT_FOUNDATION.md) to the existing Integration Hub. The new tenant-RLS OAuthAuthorizationAttempt and ProviderCredential records enforce single-use state claims, AES-256-GCM encryption, independent account attestation requirements and irreversible token revocation. The Command Center displays read-only token lifecycle health, but it cannot authenticate a provider or publish externally. There is **no live provider OAuth callback, production credential integration or real publishing adapter** yet; release remains blocked pending R2C provider-specific verified staging.

### R2E-C signed post claims and read-only delivery reconciliation

[Read the R2E-C reuse map, source evidence controls and release gates](docs/blueprint-v2/R2E_C_SOURCE_RECONCILIATION.md). Narrow, signed Meta Page post-add events yield only tenant/connection-scoped hashed candidate references in existing immutable quarantined webhook evidence. The publication Studio exposes read-only reconciliation with the canonical approval, rights, brand and scope controls and zero fabricated remote receipts. SANDBOX-only attempts, lack of customer destination binding and unfinished provider staging keep all live publishing disabled.

### R2F-A default-deny governed publication release gate

[R2F-A release barrier Reuse Map, policy and outstanding production gates](docs/blueprint-v2/R2F_GOVERNED_PUBLISHING_RELEASE_BARRIER.md). Twenty-three individual, fail-closed social release requirements are evaluated in the existing @medsol/policy authority. The verified-OIDC CampaignPublicationService exposes immutable media/brand/rights/credential checks and authenticated, read-only release readiness in the existing Publication Studio. The current live prerequisites are deliberately unavailable and cannot be bypassed through a browser or agent; no external publisher, POST send endpoint or PUBLISHED database state is introduced. All unverified provider outcomes require independent source readback and are OUTCOME_UNKNOWN, never auto retried.

### R2F-B approval lifetime semantics aligned with scheduled execution

[Read the R2F-B exact approval execution-window correction](docs/blueprint-v2/R2F_B_EXACT_APPROVAL_EXECUTION_WINDOW.md). The canonical ExactCreativeScope/ApprovalService/DAM/Publication services now reject approval expiries that precede the scheduled release or fail to provide a minimum five-minute execution margin. This fixes a previously detected sandbox-only policy mismatch. Historical incompatible approvals remain immutable audit records and require a new exact-version human approval, while live external sending stays blocked.

### R2F-C durable no-send dispatch hold and locked provider adapter boundary

[Review R2F-C Reuse Map, one-use database fence, default-deny provider adapter port and live-release prerequisites](docs/blueprint-v2/R2F_C_ONE_USE_DISPATCH_FENCE.md). The canonical PublicationAttempt ledger now supports a one-use **non-dispatchable RELEASE_FENCE** in addition to SANDBOX, with tenant-admin OIDC, version CAS, idempotent replay, immutable audit and internal event. Operators can permanently block a PREPARED publication from the Publication Studio. There is no provider egress, no active REMOTE attempt, no verified delivery, and no new independent publication owner.

### R2F-D durable no-send provider preauthorization escrow

[R2F-D Reuse Map, expiry and recovery contract and real-provider prerequisites](docs/blueprint-v2/R2F_D_PREAUTHORIZATION_RESERVATION.md). The existing publication and immutable attempt authorities now stage a one-use, admin-OIDC controlled **DISPATCH_RESERVATION** against the exact approved tenant, provider connection and creative, with an idempotency fingerprint, bounded expiry, atomic audit and Outbox. Read-only recovery identifies expired-but-not-sent escrow, and operators may permanently close it; duplicate, forged, foreign-tenant and premature transitions fail. **REMOTE sending and PUBLISHED remain blocked at SQL and API layers.**

### R2G deterministic provider Simulation Lab

[Read R2G simulator Reuse Map and acceptance](docs/blueprint-v2/R2G_SIMULATED_PROVIDER_MATRIX.md). The canonical publication SANDBOX path now supports twelve provider outcomes on all five existing social catalog entries, including callback duplication, delayed readback, rejection and ambiguous timeouts. Exact approved campaign/asset preflight and a single immutable PublicationAttempt, audit and internal event are enforced. The existing Publication Studio exposes scenario selection and synthetic results. This never performs actual vendor requests, does not treat simulated delivery as real metrics, and does not change the hard-locked live provider gateway.
