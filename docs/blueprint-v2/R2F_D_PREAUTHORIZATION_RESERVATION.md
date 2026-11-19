# R2F-D — Durable provider preauthorization escrow, no live dispatch

**Delivery type:** One-use, tenant/connection-bound *preauthorization* reservation and expiry recovery in the canonical PublicationAttempt authority. **No REMOTE send, no verified provider ownership, no actual app permission, no live publishing.**

## Reuse Map (mandatory master-blueprint rule)

| Business concept | Single authoritative owner | R2F-D extension |
|---|---|---|
| Campaign / asset / immutable exact approval | CampaignService; CreativeAssetService; ApprovalService; ExactCreativeScope | Re-check existing CampaignPublicationService.check before reservation; no duplicate approval logic or shadow copy |
| Publication, attempt idempotency and state | CampaignPublicationService, CampaignPublication, PublicationAttempt | Add `DISPATCH_RESERVATION` mode with `AWAITING_AUTHORIZATION` outcome and 10-minute expiry; **same existing table and immutable evidence** |
| Tenant connection identity | PlatformIntegrationHubService / IntegrationConnection | Reserve against actual tenant/brand/destination, provider-key and exact approved scope. Registered PENDING_VERIFICATION still means **not verified** |
| Human roles and identity | OIDC authentication, existing User and marketing permissions | Fresh matching subject and active ADMIN/SUPER_ADMIN required, `MANAGE_TENANT`; no agent/browser authority escalation |
| Policy | `@medsol/policy` and R2F-A releaseReadiness | Remains independent, default DENY. Escrow does not mark a false policy checkbox true |
| Audit and internal events | Existing AuditEvent and OutboxEvent | One durable transaction commits reservation, version CAS, audit and internal no-send event |
| Provider adapters | Existing R2F-C OfficialSocialPublishingAdapter and LockedOfficialProviderDispatchGateway | **Unchanged locked gateway**, no provider side effects |
| Provider notification / receipts | ProviderWebhookEvidenceService; CampaignPublicationService.reconcileProviderDelivery | Distinguish escrow from genuine remote attempts; signed Meta events remain QUARANTINED |
| UX and BFF | Existing Campaign Publication Studio and Next authenticated BFF | Explicit admin-only "Stage authorization escrow · No send", read-only status and expiry closing |

## What is a reservation?

A reservation is an internal request to prepare for *future* provider authorization, **not** a permit or durable claim that an external send is allowed.

- One publication can acquire at most one `DISPATCH_RESERVATION`, enforced by an indexed PostgreSQL partial unique constraint. It must start in PREPARED with no prior attempt and expectedVersion matching current version, exact approved campaign/creative scope, current media rights and an existing tenant/brand/destination connection.
- The admin supplies a UUID-like idempotency key and 12–500-character reason. The system stores a tenant/publication/connection domain-separated SHA-256 fingerprint, not the raw key.
- In one serializable transaction, create `PublicationAttempt(mode=DISPATCH_RESERVATION,outcome=AWAITING_AUTHORIZATION,sequence=1)`, CAS PREPARED → AWAITING_AUTHORIZATION, and create one audit and internal Outbox event.
- The row records `integrationConnectionId`, `providerKey` and an immutable `reservationExpiresAt` computed by the backend (10 minutes). SQL refuses reservations over 15 minutes, stale/future-created timestamps, a mismatched tenant, stale publication or different approval/destination/provider.
- Same idempotency key replays existing evidence without a second insert, regardless of process restart. A different key fails; concurrent callers cannot independently claim the same publication.
- SQL still denies mode REMOTE and publication status PUBLISHED, and existing attempt append-only triggers, immutable publication identity and FORCE tenant RLS remain unchanged. A new transition trigger refuses forged PREPARED→AWAITING_AUTHORIZATION without an actual reservation and refuses reopening terminal states.
- The escrow is intentionally **not renewable**. Pending escrow cannot be simulated, cancelled through the original PREPARED-only API, or used as a genuine remote attempt.

## Crash recovery and expiry

`dispatchReservationStatus` is read-only and reports `NO_RESERVATION`, `WAITING_FOR_AUTHORIZATION`, `EXPIRED_NOT_SENT`, or `CLOSED_NOT_SENT` with zero provider requests and `safeToAutomaticallyRetry=false`. No background worker emits provider messages.

After the reserved expiry, an active tenant administrator may call `expireDispatchPreauthorization` with an expected version. The same serializable transaction transitions AWAITING_AUTHORIZATION → BLOCKED, emits one immutable AuditEvent and one internal OutboxEvent. A committed closure replays harmlessly. An unexpired reservation cannot be forcibly labeled expired, including via raw SQL. To proceed after expiry, the human must create a new exact approved intent; it is never implicitly retried or resurrected.

## Security and acceptance

- Real PostgreSQL approved campaign fixture, approved creative and scoped Meta registration, two simultaneous same-key reservations, exact replay, different-key collision, foreign-tenant/forged-subject/nonadmin denial.
- DB-level false-scope injection, attempt update, real REMOTE creation, status reopening and premature expiry are rejected.
- Read model, real Postgres historical migration, immutable source/audit/outbox counts, no sandbox/escrow counted as remote receipts.
- Operator/UI and authenticated BFF explicitly expose only preauthorization staging, status and expiry closure. Generic POST /publish or /dispatch remains prohibited.
- A real timestamp-bounded row is observed expiring and then permanently closed without an outbound call. The provider gateway stays hard-locked with zero vendor requests.
- Full repository CI must pass typecheck, migrations/drift, PostgreSQL tests, build and dependency/SBOM evidence before merge.

## Outstanding true outbound dispatch work

This tranche **does not complete authorized REMOTE reservation, egress or receipts**. R2F-E must supply independently verifiable tenant subscription, true customer account/destination ownership and credentials, provider App Review and capability readbacks, safe region/purpose and audience consent, a strictly governed operator unlock and per-provider kill switches. The canonical PublicationAttempt ledger must then be extended to an approved one-use REMOTE state that records an immutable actual outbound ID **before** a provider API call, with crash-ambiguous OUTCOME_UNKNOWN and **no blind retries**, and independently authenticates provider GET readback and signed receipt against exact approved scope. This requires real staging credentials and external provider acceptance; they are not present in this repository.

**Conclusion:** R2F-D is a reliable, tested administrative preauthorization *foundation*, not a production publishing engine.
