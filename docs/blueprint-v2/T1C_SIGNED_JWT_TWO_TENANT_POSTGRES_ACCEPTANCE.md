# T1C — Actual signed JWT and real PostgreSQL tenant acceptance

**21 November 2026.** Engineering evidence, **NOT_CERTIFIED**.

## Reuse Map
- Extends the existing T1B `BootstrapAuthGuard`, `verifyOidcIdentity` and T1B shared `oidc-tenant` contract; `AuthSessionService`, `User`, `TenantRolePolicyService` and transaction-local PostgreSQL tenant context remain authoritative.
- No second identity store, auth bypass, session authority or provider accounts. Remote public JWKS network lookup is substituted by an in-memory public JWK **only inside the test** while authentic RS256 cryptographic verification executes.

## Real acceptance cases
A Vitest integration suite seeds two disposable organizations, two individually bound OIDC admin subjects and real PostgreSQL server sessions. It issues real RSA/RS256 JWT signatures with issuer/audience/scope, then invokes the production guard against the real DB with `MARKETING_TENANT_RESOLUTION_MODE=SIGNED_OIDC_CLAIM`. Positive tests prove isolation for both organizations; negatives cover forged tenant headers/body, cross-tenant replay, absent/malformed signed claims, altered signature, wrong issuer/audience, missing delegated scope, expired token and revoked sessions. Provider credentials remain absent.

## Limits
JWKS transport is controlled in-memory (not a real HTTPS IdP). This is genuine JWT verification plus PostgreSQL authorization, **not** external Entra UAT, external customer SSO, an actual cloud staging site, non-bypass production database proof from this isolated suite, independent penetration test or signed 500-case operator acceptance. Default R3-Y real-stack fixed-tenant CI still runs independently. No external publishing, mail or model effect.
