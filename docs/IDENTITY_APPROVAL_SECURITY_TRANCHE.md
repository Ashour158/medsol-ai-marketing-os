# Identity and approval security tranche

## Deployment modes

- `MARKETING_AUTH_MODE=bootstrap` (default): internal single-tenant pilot, with `MARKETING_BOOTSTRAP_ORGANIZATION_ID` and `MARKETING_BOOTSTRAP_TOKEN`. Approval decisions are always forbidden.
- `MARKETING_AUTH_MODE=oidc`: verified per-user bearer JWT. Configure `MARKETING_BOOTSTRAP_ORGANIZATION_ID`, `MARKETING_OIDC_ISSUER`, `MARKETING_OIDC_AUDIENCE`, and `MARKETING_OIDC_JWKS_URL` (HTTPS). The provider must issue RS256 or ES256 signed JWTs with `sub`, `email`, and `email_verified=true`. JWKS is retrieved and signatures, issuer, audience, and expiration are validated.
- OIDC users must already exist in the authoritative `User` table under the configured organization with matching lowercase email. Approval roles are read from the database, not token claims.
- Approval commands must carry the authenticated user's actual `approverUserId`; mismatch is rejected. Bootstrap tokens cannot decide approvals. Conditional approvals remain disabled.

## Known restrictions

This tranche provides verified user identity, not an interactive login experience. The current dashboard accepts manually supplied bearer tokens in memory for restricted testing. Implement an OIDC authorization-code + PKCE login, HTTP-only session cookies, CSRF defenses, session logout, and production-grade rate limits before public deployment. Configure a separate test tenant and test issuer for integration tests. Do not expose pilot tokens or credentials to browsers in production.

The current API is deliberately scoped to one configured organization. Do not claim multi-tenant authorization until token-to-tenant membership and all service-level tenant assertions have been independently validated. Campaign and workflow endpoints still require database-backed integration tests and permission review.
