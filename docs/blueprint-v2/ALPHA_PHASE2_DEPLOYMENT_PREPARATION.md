# Phase 2 — Internal Alpha deployment preparation (not deployed)

Phase 1 closed by PR #164, main merge 1af644c1042d6b7d578065f4d3a24e0ae2274c2d.
Reviewed head a791001d8a36b3f452dd6127a2a028e00d4901eb, CI 45928686776: all four jobs passed. Both Ubuntu LTS API/web images had zero high/critical and 23 other findings per image; keep lower-severity findings tracked. Build and container startup/replacement, controlled isolated-network canary, full integrated regression, signed disposable browser journeys and PostgreSQL backup/restore passed. These are CI images and local IDs, not published registry digests or deployed acceptance.

## Canonical authorities

- Existing infra/staging/compose.yml, T1E runtime auth policy, T1G DB policy and t1e-provision-operator.mjs remain authoritative.
- apps/api/scripts/alpha-host-deployment-preflight.mjs checks the resolved Compose configuration, separate private API/web files and locally available reviewed immutable references. It does not pull images or start services. It uses the canonical identity and DB policies rather than introducing a second authentication mode.
- ALPHA_DEPLOYMENT_AND_RELEASE_HANDOFF.md and alpha-host-egress-check.sh remain the actual deployment and egress handoff. ALPHA_FIRST_RELEASE_PLAN.md and alpha-release-decision.mjs own AL01–AL12 independent acceptance. No CI-only identity or data fixture may serve a real operator deployment.

## Host prerequisites and order

1. Authorized Linux Docker host (or approved environment), explicit free-resource/quota approval, reliable storage, independently configured staging OIDC issuer with signed org claims and dedicated PostgreSQL TLS verify-full runtime role. No Entra account is required for STAGING_OIDC, but a genuine staging identity service is. Codespaces is subject to idle suspension and cannot be treated as persistent production-like staging. Do not expose fixture login or database ports.
2. Obtain approved immutable registry image references matching the reviewed build and scan evidence; verify image provenance and available quota before publishing/pulling. No registry publication or host credentials are supplied by this PR.
3. From the reviewed checkout with Node 22, frozen dependencies and compiled packages, set the four MARKETING_STAGING_API_IMAGE, MARKETING_STAGING_WEB_IMAGE, MARKETING_STAGING_API_ENV_FILE, MARKETING_STAGING_WEB_ENV_FILE variables to approved references and absolute operator-owned mode-0600 files outside the checkout. Use .env.example as the common nonsecret policy. API file holds restricted DATABASE_URL, never the privileged migration DSN; web file holds the session encryption keys, never DB credentials. Both must agree on public origin and issuer/client/audience; all live flags explicitly false, model disabled. No CI flags or bootstrap tokens.
4. Run the non-mutating host check:
   ```sh
   node apps/api/scripts/alpha-host-deployment-preflight.mjs /private/alpha-host-config.json
   ```
   Output is config-only, secret-free; this does not establish TLS handshake, firewall rules, actual DB role, real operator login, or approval. No output file is overwritten. A passing check is NOT a deployment decision.
5. Follow canonical handoff to configure and independently review host default-deny egress and HTTPS proxy, provision approved distinct operators and tenants, backup/migrate using separate maintenance role, verify schema and FORCE RLS, start the reviewed image pair and check readiness, controlled canary, signed login, revocation, persistence and rollback. Do not mount the host Docker socket or expose the API/DB. No live providers or real customer data.
6. Execute AL01–AL12 independent acceptance and obtain distinct reviewer/owner attestations. Until observed, release NO-GO.

## Current blockers

Current connector can modify repository and trigger normal CI via commits, but cannot run commands inside the existing Codespace, create external IdP/DB, manage host firewall, publish images with approved credentials, or provide real independent operator signatures. No paid resource created. Current phase is deployment preparation, not an observed authenticated deployment. CI verifies configuration denial cases without touching real infrastructure. Actual host operations remain blocked until authorized access and prerequisites exist.
