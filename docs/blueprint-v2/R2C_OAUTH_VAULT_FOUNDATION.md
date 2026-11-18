# R2C-A — Provider-neutral OAuth PKCE and Encrypted Credential Foundation

**Scope:** Server-internal OAuth handshake lifecycle, one-use authorization-code claims, AES-256-GCM secret envelopes, tenant-bound credential state and read-only integration health. **No live provider is connected, and no social publishing is enabled.**

## Reuse Map

| Business concern | Single authoritative owner | R2C implementation |
| --- | --- | --- |
| Tenant identity, scope and roles | Organization / User / BootstrapAuthGuard / TenantRolePolicyService | Reuse verified OIDC and administrative governance |
| Brand and destination identity | Brand / IntegrationConnection / PlatformIntegrationHubService | Reuse registered destination, fixed provider and irreversible revocation |
| OAuth attempt | New OAuthAuthorizationAttempt under Integration Hub authority | Pending → exchanging → completed/failed one-use state, encrypted PKCE |
| Credential encryption/credential existence | New ProviderCredential under Integration Hub authority | AES-GCM vault envelope; no raw secrets in audits or public APIs; received token remains PENDING_ATTESTATION |
| Campaign, creative, human approval | CampaignService / CreativeAssetService / ApprovalService | No shadow approval, no new campaign or creative engine |
| Publication and delivery intent | CampaignPublicationService / CampaignPublication | Same exact-version preflight, still no external authorization |
| Event transport and receipts | Existing OutboxEvent / InboxEvent / PublicationAttempt | No new event bus, no live provider receipts, no parallel sending mechanism |
| Analytics and learning | MarketingPerformanceService and existing Brain | No fabricated performance outcomes |

## Security controls

The deployment must provide a 32-byte randomly generated key, encoded as canonical base64 in MARKETING_PROVIDER_VAULT_KEY_V1_BASE64, from a secret manager. No default key or checked-in key exists. ProviderSecretEnvelope uses AES-256-GCM with 96-bit random nonces and authenticated associated data binding each ciphertext to the tenant ID, connection ID and purpose (PKCE, access token, refresh token). Ciphertexts are versioned and include a key identifier, nonce and authentication tag. Cross-tenant or cross-connection decrypt, altered ciphertext and malformed key encodings fail closed. Rotating old keys with a real KMS/HSM is **not implemented**; the deployment must retain old key material until migration.

The trusted OAuth lifecycle generates cryptographically random state and PKCE verifier and stores only the state SHA-256 plus an encrypted verifier. A backend-configured, public-HTTPS, pinned-host authorization URL receives PKCE S256 challenge, preapproved scopes, client ID and exact redirect URI. There is **no public begin/callback or arbitrary endpoint/token-exchange API** in this tranche; future provider-specific adapters must be separately reviewed and configured. The connection must be pending and brand-active. A second unexpired flow or a duplicate credential is blocked.

Authorization-code claims are transactionally fenced before the trusted provider exchange callback. State is used once, expires after 10 minutes, and cannot return from EXCHANGING to PENDING. A crash after provider exchange leaves it in EXCHANGING and requires human remediation; the code is never replayed. Unexpected scopes, absent/malformed token response, expired token, revoked destination or repeated claim are blocked. Failed exchanges are terminal and require a new handshake, not a blind retry.

The trusted broker returns access/refresh tokens **only to the server**. Successful exchange encrypts them inside ProviderCredential, linked to a unique tenant/destination; never includes raw tokens in responses or audit events. Status remains PENDING_ATTESTATION. Token presence **does not prove provider account ownership or authorize posting**. An approved destination account, provider capability and scopes need independent verification against actual provider APIs in a later R2C tranche. The general Platform Integration Hub REVOKE action also revokes a received credential inside the same transaction, with audit and SQL protection against unrevoking.

OAuthAuthorizationAttempt and ProviderCredential have tenant composite foreign keys, FORCE PostgreSQL RLS, immutable provenance/ciphertext triggers and revocation constraints. The added GET /marketing/integrations/:id/health endpoint exposes only token lifecycle/expiry and explicit false account/capability authorization; no credentials, verifier, exchange code, raw state or encryption metadata is returned. OIDC/role controls and the Next.js BFF allowlist protect it.

The existing CampaignPublication preflight shows a new **encryptedTokenReceivedPendingAttestation** flag, separate from destination registration, verified media readback, provider verification and external-effect permission. The externalReady/externalEffectsAuthorized flags remain false regardless of token storage.

## CI and negative verification

- AES-256-GCM unit tests: key length, nonce randomness, ciphertext tampering, wrong key/tenant/connection/purpose, key environment.
- Real PostgreSQL OAuth attempt integration tests: tenant isolation, pinned authorization endpoint, unsupported scopes, PKCE S256 challenge, one-use state claim, untrusted broker rejection, token encryption, audit secret non-leakage, duplicate token/authorization refusal, SQL mutation denial and connection-revocation cascade.
- Failed exchange test: unexpected granted scope, one provider exchange call, terminal FAILED state and no credential.
- Non-BYPASSRLS role test for both tables: missing scope hidden, correct tenant visible, other tenant hidden, pooled connection context reset.
- Existing R2B and R2 publication tests continue to require full CI verification.
- Source/test existence, CI SBOM evidence or a green build are **not** provider platform certifications.

## Still required before live publishing

Real provider authorization adapters and callback endpoints, exact vendor OAuth parameters and API approvals, signed account ownership/capability verification, server-side PKCE + CSRF/cookie binding for web callback, secret-manager backed key rotation, platform token refresh/rotation, audited provider revocation calls, object-store production validation/virus scan, consent/territory/privacy checks, tenant subscription and agency entitlements, commercial policy release gate, real provider receipts and Inbox/Outbox reconciliation, platform-specific signature verification, incidents and sandbox UAT. Issue #4 dependency security and issue #3 ECC app Checks permissions remain unresolved.

**Do not activate a live publishing toggle, introduce a generic provider HTTP client, or store user-supplied tokens before these guards exist and pass provider staging tests.** The database still forbids PUBLISHED on CampaignPublication in the current internal sandbox.
