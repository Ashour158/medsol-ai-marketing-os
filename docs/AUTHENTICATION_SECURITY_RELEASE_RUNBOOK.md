# Authentication closure — security release runbook

## Completed code controls
- OIDC authorization code + PKCE S256, state, nonce, ID token signature/issuer/audience validation.
- Verified JWT access tokens independently checked at API with pinned issuer, audience, JWKS and algorithm allowlist.
- Immutable OIDC subject bound to tenant-scoped User. Email matching alone cannot authorize a user. Disabled users are rejected on every request.
- Database-owned AuthSession with UUID, tenant, user, expiry, revokedAt. Every OIDC API request requires an active matching session. Logout revokes it; revoked sessions cannot continue using an otherwise valid access token.
- Encrypted HttpOnly session cookie; SameSite=Lax, production Secure and __Host prefix; browser JavaScript never stores tokens.
- Session key rotation: MARKETING_SESSION_SECRETS=current-base64url-key,previous-base64url-key. Retire previous keys after max session TTL. Each key must be exactly 32 random bytes.
- Origin checks for mutating same-origin proxy requests, restricted route registry, RBAC and independent human approval.
- Production API refuses bootstrap authentication. CI exercises PostgreSQL and unit-level identity/session tests.

## Provisioning requirement
Deploy reviewed Prisma migrations, including 20261118030000_oidc_identity_sessions, using `prisma migrate deploy` in the deployment pipeline. For each trusted identity-provider account, provision User with its immutable OIDC `sub` as `oidcSubject`, lowercase verified email, tenant ID and appropriate role. Unbound users are deliberately denied. To revoke a user, set disabledAt and revoke all of their AuthSession records.

## Provider setup (operator required)
1. Choose and configure an OIDC identity provider and public web client. Register the exact HTTPS redirect URI `https://YOUR_HOST/api/auth/callback`.
2. Configure MARKETING_PUBLIC_ORIGIN, MARKETING_OIDC_ISSUER, MARKETING_OIDC_CLIENT_ID, MARKETING_BOOTSTRAP_ORGANIZATION_ID and MARKETING_SESSION_SECRETS in web server secrets.
3. Configure API MARKETING_AUTH_MODE=oidc, MARKETING_OIDC_ISSUER, MARKETING_OIDC_AUDIENCE, MARKETING_OIDC_JWKS_URL, organization ID and database URL.
4. Configure the provider to issue signed JWT **access tokens** containing `sub`, `email` and boolean `email_verified=true`. Some providers do not put verified email into access tokens; in that case adapt identity mapping with explicit provider integration and tests rather than relaxing checks.
5. Use a private network for MARKETING_API_INTERNAL_URL. Keep TLS enforced at public ingress.

## Staging acceptance matrix
- Valid login, callback, authorized user, refresh page, logout, and expired session.
- Invalid state, nonce, code, token signature, issuer, audience, JWKS and email verification.
- Same email with a different `sub`; unbound `sub`; disabled user; cross-tenant membership; role change mid-session.
- Missing session ID, forged session ID, revoked session ID, concurrent logout, cross-origin POST, cookie tampering and key rotation.
- Campaign author/submitter cannot approve; independent reviewer can; unauthorized agent cannot publish.
- Confirm HTTP security headers, secret handling, database migration and audit telemetry.

## Explicit limitations
- No automatic refresh token flow: users reauthenticate after at most one hour. This avoids persistent refresh secrets until a provider-specific secure rotation strategy is implemented.
- Identity-provider initiated logout, back-channel logout, rate limiting, distributed abuse controls, login telemetry and independent penetration testing are still required for a public production launch.
- The deployment remains configured for one organization; generalized multi-tenant provisioning and enterprise SSO federation are not implemented.
- CI cannot prove compatibility with a real identity provider or deployed TLS/network controls without provider configuration and staging credentials.

Do not declare production security sign-off until CI passes and staging tests above are evidenced.
