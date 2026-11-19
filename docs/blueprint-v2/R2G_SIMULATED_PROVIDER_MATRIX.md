# R2G — Deterministic multi-provider publishing simulation through canonical CampaignPublicationService

**Scope:** A functional no-account simulation matrix for the R2 publication vertical slice, using the authoritative CampaignPublicationService. It is NOT real provider dispatch, provider verification or customer publishing. Do not count mock receipts as production delivery.

## Reuse Map
| Business fact | Reused owner | Extension |
| --- | --- | --- |
| Provider identities | PlatformIntegrationHubService / PLATFORM_CATALOG | Simulator reads the existing single social provider registry (LinkedIn, Meta, TikTok, YouTube, X) |
| Campaign/asset/human approval | CampaignService, CreativeAssetService, ApprovalService | Existing exact-scope `CampaignPublicationService.check` is always required for a new simulation |
| Publication and attempt | CampaignPublicationService, CampaignPublication, PublicationAttempt | Existing `simulate` accepts an optional deterministic provider scenario + idempotency key; **no second publishing ledger** |
| Audit, internal messaging | AuditEvent, OutboxEvent | One transaction records immutable SANDBOX attempt, state CAS, audit and internal event; no network |
| Reconciliation and analytics | CampaignPublicationService.reconcileProviderDelivery, MarketingPerformanceService | Counts only real REMOTE attempts as real; simulated callback/readback never produces verified provider receipt or impressions |
| Studio, auth and roles | Existing authenticated `POST /marketing/publications/:id/simulate`, permission registry, Next.js BFF, Publication Studio | The same API offers optional scenario simulation; separate public publish route is still prohibited |

## Simulator behavior

Twelve deterministic scenarios on all catalog social providers:
- `SUCCESS`: synthetic HTTP acceptance, matching synthetic readback, one mock webhook, terminal SIMULATED
- `POLICY_REJECTED`, `RATE_LIMITED`, `TOKEN_EXPIRED`, `ACCOUNT_REVOKED`, `MEDIA_REJECTED`: terminal BLOCKED, no synthetic post
- `TIMEOUT_BEFORE_ACK`, `TIMEOUT_AFTER_ACCEPT`, `PROVIDER_5XX`: terminal OUTCOME_UNKNOWN, **never automatic retry**
- `WEBHOOK_BEFORE_READBACK`: virtual callback arrives before matching readback, remains OUTCOME_UNKNOWN
- `DUPLICATE_CALLBACK`: two virtual callbacks deduplicate to one local event, synthetic matching readback
- `READBACK_MISMATCH`: synthetic post exists but readback mismatches approved scope, remains OUTCOME_UNKNOWN

Each run is deterministic and source-bound by the tenant, exact immutable approval scope digest, actual tenant IntegrationConnection, scenario, publication and operator idempotency key. The simulator uses **no provider credentials, network requests, callbacks from vendors, or verified remote accounts**. Its claims use an `internal:simulated-provider-*` reference, never a live URL.

A new execution:
1. Reads current tenant publication, immutable exact approval and registered destination.
2. Uses existing canonical publication preflight, so a stale creative, rights review or brand/schedule change invalidates execution.
3. Evaluates synthetic response/readback and derives a canonical terminal state (SIMULATED, BLOCKED or OUTCOME_UNKNOWN).
4. Inserts **exactly one** existing `PublicationAttempt(mode=SANDBOX)` with internal SHA-256 receipt, atomically updates the publication version/state, records AuditEvent and internal OutboxEvent.
5. Same scenario/key replays existing evidence, different scenario/key is denied, cross-tenant publication cannot be read.
6. Read-only reconciliation still reports `NO_AUTHORIZED_REMOTE_ATTEMPT`, zero verified real remote receipts, and no fabricated impressions/leads.
7. Existing legacy `simulate` API with no scenario preserves its original sandbox behavior.

## Acceptance
- Full scenario unit tests, every provider from the existing Integration Hub catalog.
- Fake identity, bad scope digest, unsupported scenario/provider and cross-tenant source denied.
- Real PostgreSQL approved Campaign+CreativeAssetRevision test creates multiple immutably approved publication intents and exercises success, rejection, timeout, mismatched readback, duplicated callback, out-of-order callback.
- Exactly one SANDBOX attempt and single audit/outbox per publication, idempotent replay and no external receipt/metrics after each.
- Existing OAuth, publisher lock, SQL ban on REMOTE and PUBLISHED, release fences and preauthorization remain unchanged.
- Repository typecheck, DB clean/historical migration, full Vitest, app build and SBOM security gates required before merging.

## Outstanding R2
This tranche makes social publishing **testable end to end against synthetic providers**. It does not complete editable design generation, broad brief ingestion, compliant consent/email journeys, validated source analytics, account-free provider-specific API contract adapters or all R2 customer journeys. Do not mark R2 complete without those paths, the simulation campaign acceptance and later real-provider staging. R3 Agent/Workflow/Blueprint Studios, A2A/MCP, multi-model routing and knowledge fabric remain separate milestones.
