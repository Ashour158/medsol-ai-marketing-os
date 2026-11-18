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
