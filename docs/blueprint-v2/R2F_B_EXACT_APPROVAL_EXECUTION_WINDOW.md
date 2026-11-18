# R2F-B — Correct exact creative approval expiry for scheduled publishing

**Scope:** Correct the existing canonical exact-version approval contract and its enforcement across creative preparation, human decision, publication preflight and release readiness. No new approval table, no shadow scheduler, no publish API and no external send activation.

## Blueprint Reuse Map
- `ExactCreativeScope` / `exactCreativeScopeHash` remain the single canonical content+audience+destination+time scope identity. `isExactCreativeScope` now validates the complete execution window.
- `CreativeAssetService.submitForApproval` remains the sole source of approved creative requests. It rejects approval expiries that precede or insufficiently cover the scheduled execution, with an explicit 90-day bound.
- `ApprovalService.approve` remains the only human decision owner. It checks exact scope validity and expiry equality against the stored immutable approval before accepting independent human approval.
- `CreativeAssetService.reviewApprovalState` and `CampaignPublicationService.check` remain the respective read validity authorities; incompatible historical records are treated as stale, not modified in place.
- `CampaignPublicationService.releaseReadiness` still applies the 23 R2F-A gates and stays blocked for missing provider/tenant/consent authority. The live send clock invariant now agrees with exact approval scope validity.
- `apps/web/src/app/creative-governance-studio.tsx` makes the new rule clear and prevents submitting obviously incompatible times; server policy remains authoritative.

## Fixed invariant
For an approved, independently reviewed creative scheduled at time T, its exact approval must remain valid at least until **T plus five minutes** (strictly later than that boundary); specifically, `expiry > scheduledAt + EXACT_APPROVAL_EXECUTION_GRACE_MS` and expiry must still be after the current time when checked. The approval expiry field is a bound on **release authorization**, not a deadline before which publication must be scheduled.

Why this matters: the older sandbox code required `expiresAt < scheduledAt`. That permitted an internal synthetic simulation but would have guaranteed a live provider attempt at its scheduled time lacked valid human approval. R2F-A correctly blocked this class. R2F-B prevents new invalid approvals and revokes any *derived validity* from historical incompatible scopes without rewriting old approvals or simulated receipts.

## Legacy records and migration
No SQL migration: the immutable stored scope JSON and canonical SHA-256 scope digest keep their original evidence. Any existing approval whose expiry predates the scheduled send:
1. Remains unchanged for historical audit and source provenance.
2. Is considered invalid by `isExactCreativeScope` and its ordinary Approval/Creative/Publication read models.
3. Must be replaced through a **new immutable approval request and separate human review** with a valid time window. Its old synthetic receipt remains synthetic.
4. Cannot by itself enable provider dispatch; R2F-A external egress is still blocked.

Revised `expiresAt` is now bounded to 90 days to allow an approved schedule within the existing 90-day scheduledAt range. A customer cannot revive a prior approval by editing the deadline, bypassing maker-checker, reusing a stale digest, or choosing a different destination.

## Acceptance
- Canonical scope validator accepts valid scheduled-before-expiry (plus five minute buffer) and rejects reversed/equal/insufficient grace or malformed timestamps.
- Real PostgreSQL DAM workflows reject old time ordering at approval creation, and valid approved scopes remain current.
- Real PostgreSQL ApprovalService rejects a manually inserted legacy-shaped expired-before-execution approval; its decision remains PENDING and its read model remains invalid.
- Publication Studio still permits sandbox simulation of newly correctly approved scope; release-readiness check for time is true while live capability/entitlement/ownership/purpose/operator gates remain false.
- Version changes invalidate exact approvals, no provider request is made and no real PublicationAttempt is created.
- Historical migrations/drift, TypeScript, full tests and UI build must pass before merge.

## Remaining R2F
R2F-A and R2F-B are prerequisites, not a live provider publisher. R2F requires real provider authorization and ownership, entitlement/agency checks, official reviewed adapters, a durable one-use attempt claim, permissioned targeting/consent, provider readback/receipt correlation, kill switches, staged end-to-end proof and operator acceptance. **No external publishing is enabled in R2F-B.**
