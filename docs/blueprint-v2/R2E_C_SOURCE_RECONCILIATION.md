# R2E-C — Signed post-claim correlation and publication reconciliation

**Classification:** Internal source-correlation and fail-closed delivery-readiness foundation. **Not actual successful social posting, provider receipt reconciliation, customer destination binding, or commercial readiness.**

## Blueprint alignment / Reuse Map

| Concern | Authoritative owner | R2E-C approach |
| --- | --- | --- |
| Campaign, brand, scope, creator/reviewer and rights | CampaignService, BrandMasterService, CreativeAssetService, ApprovalService | Recheck existing exact-scope preflight via CampaignPublicationService.check; never create a shadow approval engine |
| Publication intent and delivery record | CampaignPublicationService, CampaignPublication, PublicationAttempt | Add *read-only* reconciliation to canonical publication owner; preserve SANDBOX-only PublicationAttempt and SQL PUBLISHED prohibition |
| Tenant provider connection | IntegrationConnection and PlatformIntegrationHubService | Find exact tenant, brand and immutable destinationRef; no new registration authority |
| Authenticated provider notification | ProviderWebhookObservation + ProviderWebhookEvidenceService | Append claimed Meta post-add references to existing immutable QUARANTINED observation; no second remote receipt ledger |
| Inbound replay protection | InboxEvent | Reuse R2E-A connection-scoped idempotency, atomic with evidence and audit |
| Audit / metrics | AuditEvent and MarketingPerformanceService | No raw provider post/user IDs in audit and no fabricated impressions, leads or social success |
| Browser access | Verified OIDC, marketing-permissions, Next.js BFF allowlist, Campaign Publication Studio | Read-only `GET /marketing/publications/:id/reconciliation` with `READ_AUDIT`; no callback/publish POST route |

## Inputs and verified-scope logic

A signed Meta Page event is considered a *candidate post-add claim* only when the exact HMAC-SHA256 raw payload was verified first and it contains **one** page entry with a numeric account ID, a plausible event timestamp, one `feed` change, `value.item=post`, `value.verb=add`, and `value.post_id=<same-page-id>_<post-id>`. Any non-post, edit/delete, multi-entry, account mismatch, stale/future timestamp, Instagram, or malformed event remains a generic signed notification and cannot produce candidate post evidence.

The short-lived raw account and post reference values are hashed with separate domain-separated SHA-256 labels and **both tenant ID and connection ID**. Stored new fields are `candidateAccountDigest`, `candidatePostDigest`, and `candidateEventAt` on the existing ProviderWebhookObservation. Existing rows remain NULL. Database constraints require all three together; the original append-only UPDATE/DELETE trigger and FORCE tenant RLS still apply. Hashed candidate IDs are metadata, **not** cryptographic proof that a specific campaign was dispatched. The hash deters accidental joins across subscriptions; it is not intended to hide easily guessed public post IDs from determined offline guessing, so restrict database access appropriately.

## Read-only reconciliation contract

`CampaignPublicationService.reconcileProviderDelivery(tenant,publicationId)`:
1. Enforces authenticated tenant-scoped database lookups and finds the canonical publication, approved exact-scope destination and current preflight. Rejects foreign/unknown publication IDs.
2. Checks the canonical PublicationAttempt ledger for a genuine non-SANDBOX authorized attempt. R2E-C database constraints make this count **zero**. A synthetic sandbox receipt cannot satisfy the gate.
3. Counts signed notifications and narrow post-add claims for the *exact* connection only; if a recent provider account observation is available, counts account-ID-consistent claims separately. This is account **consistency**, not customer ownership or publish capability.
4. Returns `correlationState=NO_AUTHORIZED_REMOTE_ATTEMPT` while there is no legitimate dispatch evidence. A future non-SANDBOX attempt without independently verified readback must remain `OUTCOME_UNKNOWN`; no blind retries and no inferred success.
5. Always exposes `verifiedRemoteReceipts=0`, `providerReceiptVerified=false`, `customerDestinationBound=false`, `externallyPublished=false`, `externalEffectsAuthorized=false` for this phase.
6. Carries the existing approval/rights/brand-source preflight reasons into the read model. A newer revision, expired approval or changed rights cannot be hidden by a signed provider notification.

No mutation occurs in the reconciliation GET. Existing publication-detail and source-reviewed performance remain separate.

## Data governance and release safeguards

- No raw webhook body, external account ID or provider post ID is stored in the immutable evidence or audit. Only signed source digests, scoped post/account digests, timestamp and classification are recorded.
- The provider account observation can expire/revoke; its matching candidate count is informational only. A matching signed account identifier does **not** prove customer ownership.
- Signed callbacks from another tenant or connection cannot be joined by unsalted raw post IDs.
- External publishing remains blocked by existing SQL and application gates. There is **no** automatic transition of CampaignPublication to PUBLISHED, no remote attempt creation, no outbound provider API, no new queue or publisher, and no unreviewed attribution.
- R2E-C does not change the R2E-A/B isolated callback process or the OIDC-guarded main API ingress boundary.

## Tests / acceptance

- Meta exact raw HMAC verification and strict single post-add event extraction, signed wrong-account/edit/comment/Instagram/stale/future exclusions, tampered payload denial.
- Deterministic scope-separated claim hashes and rejection of URL/traversal/invalid account identifiers.
- Real PostgreSQL Meta signed notification records: immutable candidate fields, no raw IDs in rows/audit, replay idempotency, tenant/connection separation and existing FORCE RLS.
- End-to-end real PostgreSQL campaign approval → rights-reviewed creative → exact approval → publication intent → signed unrelated Meta post-add → reconciliation → sandbox attempt: never report remote delivery, including after a later creative revision invalidates the original approval.
- OIDC READ_AUDIT route mapping, Next.js BFF exact allowlist, read-only UI; no direct POST reconciliation or publish endpoint.
- Require clean/historical migrations, Prisma drift, workspace TypeScript tests, web build and security evidence CI before merge.

## Remaining true R2E remote-delivery prerequisites / R2F dependency

There is **no** real provider-authorized outbound publication attempt. To reconcile *actual delivery* at R2F, the system must first implement a server-authenticated, exactly approved, tenant/brand/destination/credential-bound publication worker and immutable remote dispatch attempt with idempotency, provider API response handling, `OUTCOME_UNKNOWN` on ambiguous timeouts, and no blind retry. Then a provider-specific official API readback plus authenticated signed provider receipt can bind the remote post to the exact dispatch, ownership and account, and only then allow a verified receipt record in the existing publication authority. This requires live provider credentials, app review, destination ownership proof, policy/consent/suppression, IAM/RLS hardening and end-to-end staging. None of those exist merely by merging this PR.

**Development R2E-C correlation code can be complete and green; verified live provider delivery remains explicitly unimplemented until the external dependencies are fulfilled.**
