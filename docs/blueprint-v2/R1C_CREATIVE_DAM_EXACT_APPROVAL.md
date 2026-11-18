# R1C — Versioned Creative DAM and Exact-Content Human Approval

**Implementation scope:** database-backed creative metadata, immutable revisions, tenant/brand scoping, independent rights review, version-pinned human approval. **No asset file upload, no provider-verified editability, no social publishing, no email sending, no cryptographic C2PA verification, and no commercial release authorization.**

## Reuse Map and canonical ownership

- **Organization / Brand:** Existing tenant and brand identity authorities. No shadow tenant or brand master.
- **BrandMasterRevision:** Existing tenant-wide approved rules authority. Creative approval request pins its currently approved `vN` revision. Per-brand Brand Master migration remains a separate future workstream.
- **User / TenantRolePolicyService / BootstrapAuthGuard:** Current OIDC human identity and roles. No new user store, self-issued privileged roles or agent reviewer.
- **CreativeAsset:** New authoritative tenant-owned asset metadata record, belonging to one existing Brand. It is not a binary object store, CMS, PIM or file upload system.
- **CreativeAssetRevision:** New immutable (SQL-trigger-protected) versioned source/rendition metadata and one-time independent rights review.
- **ApprovalService / Approval:** **Existing** approval authority, extended with optional exact-scope data and a composite FK to a creative revision. The same `/marketing/approvals/decide` action owns human decisions. All legacy Campaign approvals remain supported without a forced data backfill or duplicate workflow.
- **AuditEvent:** The only audit-event authority; writes from creative lifecycle and decisions occur in the same transaction as state.
- **WorkflowExecution / OutboxEvent:** Existing orchestration and delivery authorities are unchanged; no new delivery queue or external publication intent is invented.
- **RLS:** FORCE row-level security on both new creative tables, using transaction-local `app.marketing_tenant_id`. Existing TenantRoleDefinition remains RLS-protected. **Existing Campaign, Approval, User and Brand tables are not yet fully under global tenant RLS**, so database-wide commercial isolation is not certified.

## New REST capabilities (all authenticated through existing API/BFF)

| API | Method | Existing permission | Outcome |
| --- | --- | --- | --- |
| `/marketing/assets` | GET | READ_PORTFOLIO | Only current tenant's asset metadata |
| `/marketing/assets` | POST | MANAGE_CAMPAIGN | Create metadata linked to an active tenant Brand |
| `/marketing/assets/:id` | GET | READ_PORTFOLIO | Tenant-owned versions, digests and rights review without exposing raw source keys |
| `/marketing/assets/:id/revisions` | POST | MANAGE_CAMPAIGN | Append a new immutable content version with CAS and audit |
| `/marketing/assets/revisions/:id/rights-review` | POST | DECIDE_APPROVAL | One-time reviewed rights decision, independent of the asset creator |
| `/marketing/assets/revisions/:id/submit-approval` | POST | MANAGE_CAMPAIGN | Create a pending, exact-version Approval via existing Approval model |
| `/marketing/assets/approvals/:id` | GET | READ_APPROVALS | Read current human decision and validity; **never** authorize external effects |
| `/marketing/approvals/decide` | POST | DECIDE_APPROVAL | Existing human decision engine validates immutable creative scope |

All resource IDs, tenants and reviewer identity derive from authorized server context and database records. User-supplied `organizationId` cannot select another tenant. No public, anonymous or bootstrap-token DAM mutation.

## Exact-content authorization contract

A creative approval is bound to a canonical SHA-256 digest over **all** of:
1. Tenant-owned asset ID and immutable revision ID/version.
2. Brand ID, source reference and rendition SHA-256 digest.
3. Destination channel (social, email, website) and connected-destination internal reference.
4. Audience-snapshot internal reference.
5. Currently approved tenant Brand Master policy version.
6. Scheduled publication instant and human-approval expiry.

Any material asset version change, policy revision, rights expiry, canceled/deactivated brand or change of destination/audience/channel/schedule makes the exact approval insufficient or stale. Approval must be by a distinct qualified human user, not the asset author/requester, on the existing ApprovalService.

**Important:** `internal:creative-source/...`, `internal:connected-destination/...` and `internal:audience-snapshot/...` are currently **identifiers only**. The system has not yet verified binary bytes, source editing capabilities, linked social accounts, customer consent or legal audience snapshots. These are required for any external effect and are deliberately not inferred from the metadata.

Even when human approval is valid, the read model explicitly returns `externallyExecutable:false`. This is not an external publishing authorization and cannot be used as a bypass in a future provider adapter.

## Database invariants and backward compatibility

- Additive migration only. The old `Approval` fields and campaigns continue unchanged. Asset-specific exact-scope data is nullable for legacy approvals, but required for any `CreativeAssetRevision` approval.
- Composite tenant foreign keys to `Brand`, `CreativeAsset`, and `CreativeAssetRevision` prevent cross-tenant references, even from direct SQL.
- The SQL trigger refuses modification of immutable revision identity, content hash/source, rights-expiry and original author; it permits an independent rights review exactly once.
- Database RLS defaults to invisible when no transaction-local tenant context is set and applies even to normal table-owner execution.
- No application DELETE API exists. Historical asset revisions/approvals stay auditable and append-only from public workflows.
- Repeated approval submission with the same scope is a read-only replay, while competing pending scopes are rejected.
- Rights review requires an enabled manager in the current tenant and independence from asset creator.

## Validation evidence

- `exact-creative-scope.test.ts`: canonical scope hash changes with every material field; rejects unknown or injected fields.
- `postgres-creative-assets.integration.test.ts`: two tenants, composite brand ownership, immutable revisions, unaudited rights blocked, self-review denied, accepted independent review, exact approval, same-scope replay, different-scope denial, stale-version invalidation and SQL immutable-source trigger.
- Separate real PostgreSQL RLS test: missing tenant context returns no rows, correct scoped tenant sees its own assets, foreign tenant sees none, pool reuse does not retain context.
- CI applies fresh and historical migration chains, checks Prisma drift, runs tests, builds app and uploads security evidence.

## Unfinished R1 and commercial launch gates

1. Tenant-wide authenticated OIDC enrollment and agency/brand-scoped resource permissions (today an organization is still statically configured); strengthen immutable role/approval policy and cross-process session revocation.
2. Force RLS on the remainder of tenant-owned tables with trusted transaction-local context and a non-BYPASSRLS production role; test pool reuse and direct SQL.
3. Real object-store signed uploads, checksum verification against immutable bytes, editing providers, license/artifact provenance, C2PA signature validation, media previews/versions and retention.
4. Approved destination account registry, consent-safe audience snapshots, exact preflight validated immediately before every external action, budget reservation and authoritative provider receipt reconciliation.
5. A usable Asset/Creative Studio UI with keyboard accessibility, review queue, visual comparisons and robust undo/error handling.
6. Security issue #4, ECC GitHub Checks permission issue #3, DR rehearsal, independent security review and customer UAT remain open.

**Next tranche:** trusted object storage and asset rights, brand-scoped policy, and persisted social/email approval preflight; do not activate external publishing without R0/R1 staging gates.
