# T1E — Self-hosted operator staging and full acceptance preparation

**21 November 2026 — engineering implementation; not a deployed environment or independent certification. Production NOT_CERTIFIED.**

## Reuse Map

The existing Next OIDC code/PKCE login/callback, encrypted session cookies, Nest BootstrapAuthGuard, signed OIDC access-token verifier, Prisma User and AuthSession tables, canonical tenant role policies and PostgreSQL FORCE RLS remain the ONLY authentication and authorization owners. T1E adds a strictly gated alternate trusted self-hosted OIDC issuer for staging operators, not an additional user service or a production bootstrap bypass. Existing R3-Y / T1D CI acceptance remains intact.

## Implemented tranche

- Identity: independent HTTPS issuer/JWKS, same-origin OIDC discovery endpoints, signed API audience, scoped JWT, immutable collision-free escaped subject derived from issuer+sub, signed marketing_org_id, independently verified ID/access token subject and organization at browser callback, and authoritative PostgreSQL lookup before session creation. Email never binds identity.
- Provider gating: only STAGING_OIDC + exact deployment environment staging, enabled literal OFFLINE_OPERATOR_TEST_ONLY, signed-claim tenant mode, no shared bootstrap token/tenant, no real AI/social/email credentials, all effects explicitly false. Loopback acceptance trust allowed ONLY with disposable GitHub CI flags and disposable PostgreSQL.
- UI / real-stack acceptance: seven additional Chromium cases use real Next, Nest, PostgreSQL and HTTPS simulated IdP, covering separate admin/reviewer/viewer/foreign actors, actual browser sign-in and logout, signed organization isolation, role denial and a real offline brief/campaign workflow. Existing 19 real-stack, T1D login and 51 mock-browser cases remain separately tracked.
- Ops: immutable image deployment template, nonsecret configuration example, config-only preflight, cautious dry-run-by-default operator provisioning adapter, empty unsigned operator acceptance register.

## Self-hosted identity provider setup — external prerequisite

1. Bring up an isolated, security-maintained OIDC identity service (for example a *self-hosted* Keycloak staging realm) behind a valid HTTPS domain. This software repo does not install or deploy that external service. Enable MFA, account lockouts, audit logs, individual user accounts, password reset, and trusted TLS. No real Entra/marketing/social/AI/SMTP provider is required.
2. Register a confidential OIDC web client using authorization code plus PKCE S256. Configure exact redirect URI https://YOUR-STAGING-ORIGIN/api/auth/callback (no wildcard). Disable implicit grant, dynamic public client registration and password grant.
3. Configure opaque stable signed sub for each user, signed marketing_org_id in BOTH ID and access JWTs, API audience equal to MARKETING_OIDC_AUDIENCE, and marketing delegated scope in access token (scp or scope). Set an explicit trusted JWKS URL under the issuer path. Each human identity MUST be pre-provisioned in the application's authoritative User table; there is no just-in-time user creation.
4. Create separate test maker/admin, reviewer/admin and viewer identities and at least two organizations. Tenant owners must review every identity binding and the provider-issued sub and org claims. Use the dry-run operator provision command to calculate the binding; --apply requires separate privileged staging maintenance credentials and explicit approval. Do not run maintenance privileges in app containers.
5. Configure dedicated staging TLS, secret manager, reverse proxy, isolated staging PostgreSQL, app role without SUPERUSER/BYPASSRLS, FORCE RLS on all 46 tenant tables, offline provider switches false, backups and logs. Build and security-scan immutable API/web images and pin their SHA256 digests.

## Configuration

See infra/staging/.env.example. Common variables for both web and API:
- MARKETING_DEPLOYMENT_ENV=staging
- MARKETING_IDENTITY_PROVIDER=STAGING_OIDC
- MARKETING_STAGING_OIDC_ENABLED=OFFLINE_OPERATOR_TEST_ONLY
- MARKETING_AUTH_MODE=oidc
- MARKETING_TENANT_RESOLUTION_MODE=SIGNED_OIDC_CLAIM
- MARKETING_OIDC_ISSUER equals MARKETING_STAGING_OIDC_TRUSTED_ISSUER (isolated HTTPS staging IdP).
- MARKETING_OIDC_JWKS_URL under the pinned issuer HTTPS path.
- MARKETING_OIDC_CLIENT_ID, MARKETING_OIDC_AUDIENCE are independent explicit values.
- MARKETING_STAGING_OIDC_CLIENT_SECRET is a dedicated strong secret (>=32 characters), injected only via a secret manager.
- MARKETING_PUBLIC_ORIGIN is a separate HTTPS browser origin; MARKETING_API_INTERNAL_URL is private.
- MARKETING_SESSION_SECRET or MARKETING_SESSION_SECRETS must be actual randomly generated 32-byte base64url keys.
- MARKETING_EXTERNAL_EFFECTS_ENABLED, MARKETING_AI_REASONING_ENABLED and MARKETING_REAL_EMAIL_ENABLED literal false. Do not configure live social, email, AI, Entra or provider credential values.
- DATABASE_URL API-only, application role; privileged migration/provisioning URL must NEVER go to runtime app containers.

Run with configured secrets, from the repo root, before deploying:
node apps/api/scripts/t1e-staging-preflight.mjs --output t1e-staging-preflight.json

This is a configuration-only check: it does not verify live TLS, OIDC issuer uptime, database role, human sign-in or independent certification. Use the same preflight separately for the API and web environment; omit DATABASE_URL from the web. On an actual host, execute the image compose template only with image-pinned, signed, reviewed release assets.

Operator dry-run example (provider-issued sub, not email, is immutable identity):
node apps/api/scripts/t1e-provision-operator.mjs --tenant staging-tenant-a --subject KEYCLOAK_OPAQUE_SUB --name OperatorOne --email operator@example.invalid --role VIEWER

An explicit --apply additionally requires MARKETING_STAGING_OPERATOR_WRITE_APPROVED=I_APPROVE_STAGING_IDENTITY_WRITES, and MARKETING_STAGING_MAINTENANCE_DB_URL distinct from runtime DATABASE_URL and matching MARKETING_STAGING_MAINTENANCE_DB_HOST. Do not store the privileged URL in shared envfiles. The helper cannot create a tenant and cannot upgrade or rebind an existing user silently. Provision reviewer as a separate individual.

## Operator acceptance — still to be executed and signed

- First test live HTTPS TLS/HSTS, callback, actual IdP individual MFA, DNS, JWKS, audience, issuer and UI logout/revocation, session expiration, forged signed claim and wrong-tenant denial; confirm restricted DB live startup at /readyz.
- Exercise full campaign from actual signed human operator identity: objective/brief, 13-agent offline assessment, learning/knowledge quarantine, approved brand, saved creative artifact, independent reviewer rights/approval, inert social integration metadata, simulated publication, synthetic consent-gated email, analytics and recovery. All external real sends, publishing and model inference must be exactly ZERO.
- Evaluate interface keyboard navigation, focus, names, contrast and screen reader; measure actual staging p50/p95 latency, concurrent response and failure recovery; do not claim performance certification without measured signed evidence.
- Complete all 500 independent acceptance slots with per-case tester, expected/observed behavior, timestamp, artifacts, defect and independent signature. The repository's automated mapped tests DO NOT constitute these signoffs.
- Perform live staging backup/restore and rollback rehearsal, migration drift proof, secret rotation, provider egress firewall verification, vulnerability review and incident recovery with independent signoff. No environment deployment or live-human UAT has occurred in this PR.

## Explicit limitations

No public persistent staging URL was deployed; no external Keycloak/IdP accounts were created; no real Entra, publishing, SMTP or AI accounts were linked; no independent operator or 500-case QA signoffs were fabricated. The template at infra/staging/operator-acceptance-template.json records these as NOT_RUN. Production security and disaster recovery remain NOT_CERTIFIED.
