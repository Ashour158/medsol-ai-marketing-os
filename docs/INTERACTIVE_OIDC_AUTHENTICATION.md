# Medsol Marketing OS — Interactive authentication implementation

## Architecture
- OIDC authorization-code login with PKCE S256, state and nonce. Discovery and HTTPS endpoints come from a configured trusted issuer.
- Callback exchanges code server-side and validates ID token signature, issuer, audience, verified email and nonce against JWKS.
- Access token is stored only in an authenticated encrypted AES-256-GCM HTTP-only SameSite=Lax cookie; browser JavaScript never handles bearer credentials.
- Next.js same-origin proxy reads the encrypted session and forwards the bearer token to NestJS. The API independently verifies access-token signature, issuer, audience and provisioned user membership on every call.
- Mutating proxy and logout routes require an exact Origin match. Session TTL is bounded by provider access-token lifetime (maximum one hour, minus safety margin). Logout clears the cookie.
- Production API refuses bootstrap authentication. Privileged actions use centralized RBAC and independent reviewer rules.

## Required environment variables
Web:
- MARKETING_PUBLIC_ORIGIN=https://marketing.example.com (exact deployed origin)
- MARKETING_OIDC_ISSUER=https://your-idp.example.com/tenant
- MARKETING_OIDC_CLIENT_ID=your-public-oidc-client
- MARKETING_BOOTSTRAP_ORGANIZATION_ID=authoritative-organization-uuid
- MARKETING_SESSION_SECRET=base64url-encoded cryptographically random 32+ byte key
- MARKETING_API_INTERNAL_URL=http://api:3001 (private network only)

API:
- NODE_ENV=production
- MARKETING_AUTH_MODE=oidc
- MARKETING_BOOTSTRAP_ORGANIZATION_ID=same-organization-uuid
- MARKETING_OIDC_ISSUER=same-issuer
- MARKETING_OIDC_AUDIENCE=access-token-audience (may differ from web client ID)
- MARKETING_OIDC_JWKS_URL=https://issuer.example/.well-known/jwks.json
- DATABASE_URL=...

Register https://marketing.example.com/api/auth/callback as an exact redirect URI at the identity provider. Configure the OIDC public client for authorization-code + PKCE and to issue **JWT access tokens** with email and email_verified=true (the API requires these). Provision users with matching lowercase email and organization membership in the database. Do not set a client secret in browser JavaScript.

## Known release blockers
- This is a stateless encrypted session; immediate server-side session revocation, central logout across devices, refresh-token rotation and provider back-channel logout are not implemented. Session expires within one hour; logout clears the current browser cookie.
- Staging validation against the actual chosen identity provider is required. Providers vary in access-token audience and verified email claims.
- Add browser E2E tests, CSP/security headers, rate limiting, authentication event telemetry, session key rotation, incident response and security penetration tests before public release.
- CI exercises cryptography, policy and PostgreSQL workflows but is not a substitute for deployment security testing.
- The current tenant is configured at deployment level; this is not yet a generalized multi-tenant authentication service.

## Threat model highlights
- No browser-managed access tokens, localStorage or sessionStorage credentials.
- Tampered or expired encrypted cookies are rejected.
- Login flow uses encrypted short-lived state and PKCE; callback validates nonce.
- Approval actor is resolved from authoritative user membership and must match the decision command.
- Bootstrap credentials are disabled in production.
