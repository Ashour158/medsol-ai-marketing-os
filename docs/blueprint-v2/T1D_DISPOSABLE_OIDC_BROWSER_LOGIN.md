# T1D — CI-disposable interactive OIDC browser acceptance

**21 November 2026. Status: implemented engineering acceptance slice, not independent product certification.**

## Reuse Map
- Reuse the existing Next login → discovery → nonce/state/PKCE S256 → encrypted flow cookie → callback → confidential code exchange → signed ID token verification → Nest session registration → encrypted browser session → canonical BFF → authenticated Nest / real PostgreSQL / FORCE RLS.
- Reuse the R3-Y disposable test database and signed local JWKS. Existing Entra tenant/subject mapping, authorization, tenant IAM and revocation stay authoritative; no second user store, authentication bypass, or new operator login mechanism in production.
- Extend only the existing R3-Y fixture with an OIDC discovery/authorization/token endpoint, one-time authorization-code store and strict PKCE verification. The test-only issuer is **never** accepted outside exact GitHub CI + disposable PostgreSQL + no-real-credential + disabled-egress conditions checked independently in API and Next.

## Implemented
- True browser redirect to an isolated HTTPS loopback synthetic OIDC issuer, signed ID and access JWTs, one-use authorization codes and PKCE S256 verification.
- Existing Nest API registers an actual per-user session after cryptographic validation, with real database membership and tenant-local session lookup. Browser uses the same signed/encrypted cookie and authenticated BFF as production.
- Four separate Chromium test cases for interactive login, reload and logout revocation (including stolen-cookie replay denial), forged state/callback denial and token code one-use/PKCE mismatch denial.
- Existing 19 R3-Y browser tests remain isolated, unchanged in evidence counts, using the same disposable issuer. Independent real-stack test report is persisted separately and must pass before CI continues.

## Safety and remaining work
- The synthetic issuer is loopback-only, CI-only, not a real operator SSO or persistent staging environment. The disposable confidential client key is **not** an actual provider account secret. In production the Entra-only issuer policy is unchanged and never falls back to the CI issuer.
- No durable hosted staging, real operator identity, external provider entitlements, actual mailing/posting/AI inference or independently signed 500-case acceptance is implemented. Production remains **NOT_CERTIFIED**.
