# T1 — Durable offline community case lifecycle (E18, E19, WF09, WF10)

## Reuse and upstream review

The community-edition Chatwoot model (`app/models/conversation.rb`, blob afd2d1be5ec4495f77ba6d2ddb16a03eefaf5fd7; root LICENSE blob d0425a707ab6f0cf06c9aa3c08e8edf5c64adc61) was inspected for its open/pending/resolved queue and assignment model. This increment independently implements the Medsol-specific state machine; no Ruby code, enterprise directory, upstream service or third-party dependency is copied. Chatwoot's enterprise code remains excluded.

The existing `MKT-SOC-001` classifier is the sole triage owner; `SocialCommunityCaseService` now owns persistent internal case handling. Existing Brand, Organization, User, IAM, OIDC, AuditEvent, BFF and Social Studio are reused. No duplicate classifier, contact authority, approval engine or publishing system.

## Implemented

- Synthetic fixture intake scoped to active tenant brand, classified server-side; scoped SHA-256 replay fingerprint and triage metadata only. No raw text, external account, customer contact data or provider identifiers persisted. Same fixture replay is idempotent; changed evidence conflicts.
- Open/unassigned → self-claim → pending internal review → independently closed → reopened/unassigned. Manager closure cannot be performed by the creator or assignee. All transitions use expected version and serializable transactions; stale/concurrent operations conflict. No silent automatic retry.
- Privacy escalation is urgent; scientific/brand escalation high; unanswered request normal; other disposition low. These are deterministic routing priorities, not certified crisis assessment.
- FORCE RLS and restrictive select/insert/update policies, same-tenant brand foreign key, immutable evidence, guarded transition and independent closure constraints. No delete path.
- Shared canonical IAM permission recheck inside scoped transactions, including dynamic manager-only close/reopen. No bootstrap token access.
- Operator-facing queue and controls with bounded 100-case view; internal closure never asserts scientific approval, external resolution or a reply. Audit history uses the existing audit ledger; no new parallel history owner.
- PostgreSQL regression (tenant RLS with unprivileged role, duplicates, stale actions, maker/checker, direct invalid writes and redacted audit) and real browser acceptance extensions. No new automated case count claim until CI confirms.

## Boundaries

This is a working internal synthetic case lifecycle candidate, not a connected social inbox. Real inbound event acquisition, provider identity verification, reply/closure receipts, independent specialist signoffs, evidence retention and case export, SLA timer/incident escalation and production acceptance remain pending. No live account connection, real reply, or external action. Tranche 1 remains open; canonical blueprint classifications are not promoted before evidence. CI must pass before merge.
