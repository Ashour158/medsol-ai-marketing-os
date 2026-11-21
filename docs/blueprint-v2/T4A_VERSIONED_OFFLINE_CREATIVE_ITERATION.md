# T4A — Versioned Offline Creative Iteration and Review

**21 November 2026 — engineering tranche; offline-only.**

## Mandatory Reuse Map
| Concept | Existing single owner | Extension |
|---|---|---|
| Creative asset and immutable versions | `CreativeAssetService` / `CreativeAsset`, `CreativeAssetRevision` | Add `reviseOfflineRasterDraft` that creates the next raster+copy revision on the **same asset**, not a new CMS or DAM |
| Idempotency | `CommandReceipt` | Existing organization-scoped receipt with unique command key, bound to expected version, PNG digest, copy digest and expiry |
| Tenant and brand | Existing OIDC guard, `Brand` and FORCE RLS | Authenticated manager only; active brand, same tenant and compare-and-swap asset version |
| Binary evidence | Existing `VerifiedMediaEvidenceService` | Operator still requires independent server readback; no client-attested verification |
| Independent rights | Existing `CreativeAssetService.reviewRights` | Every new version starts with no rights approval |
| Exact release | Existing `ApprovalService` and `ExactCreativeScope` | Previous revision's approval remains auditable but is no longer current after version increment |
| Operator UX | `OfflineCampaignJourneyStudio` | Iterate the same asset, see history, compare previous immutable PNG/text and selectively reuse previous copy |
| Audit | Existing `AuditEvent` | Revision progression and invalidation evidence, no second audit store |

## Delivered
- A new secure `POST /marketing/assets/:id/offline-revisions` command; same-origin Next BFF allowlist and server marketing RBAC are both extended.
- PNG and editable copy share the **same bounded validation helper** as initial offline draft creation, preventing divergent acceptance policies. JPEG, video and external media URLs are not accepted.
- Each save uses a client-observed `expectedVersion`; stale updates conflict, instead of overwriting unseen changes. One persistent `CreativeAsset` accumulates immutable source-digest versions and each has individually reviewable rights.
- Server-stored previews and history are safe tenant-specific read projections, not signed publication exports. Version comparison does not rewrite original media. Reusing a historical text is only a local editing action until saved as another immutable version.
- New version means an earlier human creative release is stale; approval and media rights must be repeated for the current revision. The UI clears old selected release IDs on edit.
- Existing offline simulation, social/email inert provider policy and no live external accounts remain unchanged.

## Acceptance
Real PostgreSQL integration verifies version 1 → 2 on the same asset, SHA-256 change, idempotent replay, reused-key mutation denial, optimistic concurrency, cross-tenant denial, old-version previews, rights separation, exact-scope invalidation and audit. Existing app-wide tests, RLS, build and CI still apply.

**Not included / NOT_CERTIFIED:** No layered Canva/Adobe source, genuine video editor, model-generated images, AI provider inference, copyright ownership verification, live social accounts, mail provider or production creative security certification. PNG header screening is not proof of complete decode or malware cleanliness. No paid hosting.
