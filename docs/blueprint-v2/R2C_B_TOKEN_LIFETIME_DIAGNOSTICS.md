# R2C-B — Fail-closed provider token lifetime diagnostics

## Reuse Map
- **PlatformIntegrationHubService** stays the authoritative IntegrationConnection health/read model.
- **ProviderCredential** remains the only credential record. **ProviderSecretEnvelope** remains the encryption owner.
- **IntegrationOAuthLifecycleService** remains the one-use OAuth lifecycle owner.
- Existing authentication, tenant RLS, audit, approval, publication preflight and outbound-effect prohibition are unchanged.
- No second credential registry, scheduled refresh engine, shadow status table, publisher, or provider adapter is introduced.

## Implemented
The Integration Hub health endpoint now distinguishes token receipt from time-limited validity, returning additional **diagnostic-only** properties:
- `tokenExpired`: true if a received pending-attestation token has passed its expiry or expiry is invalid/missing.
- `tokenExpiresWithin15Minutes`: true inside the final 15 minutes before expiry, excluding already expired.
- `tokenReadyForAttestation`: true only for a non-expired pending-attestation token outside the near-expiry window. This means *eligible to undergo future independent attestation*, **not verified**.
- `externalEffectsAuthorized`: always false.

The prior `tokenReceived`, `tokenStatus`, and `tokenExpiresAt` fields are retained for compatibility. Revoked/missing credentials never show a ready status. This change performs no token decryption or external OAuth calls, so the health endpoint cannot consume or refresh tokens.

## Contract and security tests
`apps/api/src/provider-token-lifetime.test.ts` uses fixed dates and boundary cases for absent, revoked, expired, exactly 15-minute remaining, and malformed expiry states, plus invariant tests proving every state denies external effects.

## Explicit exclusions / next release gates
- No provider account-ownership proof, verified scopes, token refresh, key rotation, KMS, cloud media adapter, provider API callback, webhooks, live posting, or publication approval change.
- Actual provider attestation requires a trusted provider-specific adapter and independently verified provider account/destination binding.
- Token diagnostics are not an authorization signal and must never override canonical publication preflight.
- Execute CI typecheck/unit/PostgreSQL tests and review prior to merge; this document is not certification or proof that checks passed.
