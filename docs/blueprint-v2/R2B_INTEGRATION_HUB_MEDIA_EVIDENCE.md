# R2B — Provider-neutral Integration Hub and Verified Media Readback

Date: 18 November 2026.
Scope: Implementation of safe connection-registration and trusted byte-readback evidence, not live social publishing, OAuth or a connected object store.

## Mandatory Reuse Map

| Concern | Authoritative owner | R2B extension |
| --- | --- | --- |
| Identity and tenant | Organization, User, BootstrapAuthGuard, TenantRolePolicyService | Reuse authenticated OIDC tenant, fixed restrictive admin grants and tenant RLS |
| Brand and approved claims | Brand, BrandMasterRevision | Destination belongs to one existing active tenant Brand |
| Campaign, workflow and Brain | CampaignService, MarketingWorkflowService, 13 canonical agents | No parallel workflow or marketing brain |
| Creative asset, source and rights | CreativeAssetRevision / CreativeAssetService | Verifier reads immutable source/digest; cannot rewrite source |
| Human approval | ApprovalService | Reuse exact version/brand/policy/rights maker-checker |
| Destination registration | NEW IntegrationConnection / PlatformIntegrationHubService | Sole owner of declared provider and destination metadata; no tokens or provider permission assertions |
| Actual media readback | NEW VerifiedMediaEvidence / VerifiedMediaEvidenceService | One byte-readback attestation record per immutable revision, independent SHA and object version |
| Publication intent and attempts | CampaignPublication / PublicationAttempt | No new send queue, receipt ledger or external call; existing synthetic SANDBOX-only state |
| Internal events | OutboxEvent, OutboxPublisherService, InboxService | No parallel message bus |
| Marketing metrics | MarketingPerformanceService | No synthetic impressions, clicks, leads or revenue |

## What is implemented

### Provider-neutral destination catalog and registration

Declared catalog entries include LINKEDIN, META_GRAPH, TIKTOK, YOUTUBE and X_API. A catalog entry does not indicate app authorization, connected OAuth credentials or available provider SDKs. Admins can register an intended destination by tenant/brand/provider/label; the server generates a unique immutable reference with prefix internal:connected-destination/. All accounts start PENDING_VERIFICATION. The SQL constraint accepts only PENDING_VERIFICATION, SUSPENDED or REVOKED; it cannot store ACTIVE or VERIFIED. Credentials, secrets, token strings, OAuth scopes and self-declared verification cannot be submitted through the public registration API.

Registrations can be SUSPENDED or irreversibly REVOKED with a stated rationale, version-fenced update and audit event in the same transaction. Restoration, duplicate registration, cross-tenant brand links and identity mutation are forbidden. The server does not claim to authenticate provider account ownership or remotely check privileges.

### Trusted media bytes and source provenance

A trusted backend VersionedMediaReader interface reads sourceRef-bound bytes and immutable version identifiers; it is never constructed from HTTP or AI prompts. The service independently calculates SHA-256 from returned bytes, checks the immutable creative revision digest and current asset version, limits size to 24 MiB, checks PNG/JPEG/WebP header signatures, and then persists an immutable, tenant-scoped, append-only style proof. The generated evidence has source, object version, SHA, bytes count, detected MIME, verifier and time.

There is no production object-store adapter, user-facing upload route or provider authentication yet. Creation of verified evidence has no HTTP endpoint. Public users cannot upload a hash, link a remote URL or claim their own bytes were independently verified. The service is tested against actual test fixture bytes read through an injected trusted mock reader. Signature checks do not certify valid full image decode, malware scanning, design editability, legal usage rights or cryptographic C2PA.

Evidence can be revoked with admin permission; SQL prevents rewriting original object version, digest, size or provenance or silently reversing revocation.

### R2 publication integration

The existing CampaignPublicationService still requires an independently approved campaign, current brand, exact creative human approval, approved policy and reviewed rights. Its preflight now observes registered destination status/provider and matching media readback hash/object version. Those are independent evidence fields. It still returns externalReady=false and externalEffectsAuthorized=false, whether or not both evidence types are present. Registered destination metadata and a synthetic receipt must never be interpreted as real social delivery.

The Command Center contains a new Integration Governance Studio for connection registrations, suspension, revocation and media-proof inspection. The existing R2 Publication Studio displays destination/readback status. No Publish or Send control exists.

## Security and testing

IntegrationConnection and VerifiedMediaEvidence enforce PostgreSQL FORCE RLS with transaction-local trusted organization scope, tenant composite foreign keys, unique logical scopes and SQL immutable identity/proof triggers. Non-BYPASSRLS role tests cover own-tenant, foreign-tenant, missing scope and database pool reuse. OIDC tenant admin authorization and strict Next.js BFF route allowlisting apply. Shared bootstrap tokens cannot read or alter integrations or proof data.

Automated evidence:
- Real PostgreSQL two-tenant registration, access and revocation.
- Reject injected credentials, unsupported providers, cross-tenant brand IDs and duplicate destinations.
- Verify actual bytes with independent SHA and expected immutable version; reject mismatched bytes, unsupported signatures, altered source and revoked proof.
- Direct SQL rejection of forged ACTIVE connection state and mutation of verified SHA.
- Full R2 campaign/creative approval test extended to show registered destination and matched readback proof while live delivery stays false.
- Full workspace typechecks, fresh and historical DB migrations/drift, integration tests and UI build in CI.

## What remains for LIVE provider operation (R2C)

1. Production versioned cloud object store, secure signed ingest, immutable source, signed readback, full media validation and malware scanning.
2. OAuth 2.0/PKCE where applicable, provider identity and account authorization, encrypted tenant secret vault, token refresh/rotation, revocation and user consent.
3. Provider-specific sanctioned SDK/HTTP transport modules, verified rate limits and platform terms, capability registry and per-provider staging account approval.
4. Bind the existing commercial authorization gateway to trusted server-side tenant/user/brand/entitlement, source rights, consent and exact version approval immediately before every outbound command.
5. Extend the existing publication attempt owner with signed provider receipt and webhook validation, authenticated reconciliation, InboxEvent deduplication, outbox fencing, UNKNOWN outcome safety, idempotency, DLQ and safe replay rules. Do not create shadow delivery or receipt tables.
6. Real staging test accounts, webhook signature verification with provider-specific algorithms, penetration test, rollback plan and independent operational acceptance.
7. Complete remaining RLS/IAM/agency client permissions, legal consent and privacy, customer onboarding, SOC operations, and separate issue #4 security-audit and issue #3 ECC GitHub App permissions.

Release truth: R2B produces a durable, verified-readback-capable internal integration foundation. OAuth, production storage connectivity, webhooks and live external publication are not implemented. Commercial production release remains blocked.
