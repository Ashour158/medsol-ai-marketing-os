# R3-Y — Actual Browser-to-API-to-PostgreSQL Staging Acceptance and Independent QA Handoff

**Implementation date:** November 21, 2026. **Release verdict: NOT_CERTIFIED.**

## Reuse Map — preserve one business owner

| Domain | Authoritative existing owner | R3-Y action |
| --- | --- | --- |
| Frontend and authenticated BFF | Next.js production build and encrypted HTTP-only session cookie | Exercise actual Chromium + loopback HTTPS, not a synthetic server as the API |
| HTTP and OIDC governance | Real Nest `AppController`, `BootstrapAuthGuard`, `verifyOidcIdentity`, `TenantRolePolicyService`, `AuthSessionService` | Start compiled Nest in production authentication mode, verify RS256 test JWT and real PostgreSQL sessions, permissions, role and token revocation |
| Tenant/database authority | Existing Prisma client, transaction-local tenant context and 46 FORCE RLS tables | Test an *actual distinct* non-superuser, NON-BYPASSRLS runtime database role and row visibility for tenants A/B and no tenant context |
| Campaign/workflow provenance | Existing `MarketingWorkflowService`, `CampaignService`, campaign audit and `ApprovalService` | Preserve **verified human workflow initiator**, including after recovery, so existing maker–checker blocks campaign self-approval; do not add a second approval authority |
| Creative and media | Existing DAM, scope approvals and verified media evidence owner | Send real Chromium Canvas PNG over authenticated HTTP, read back digest, independent rights review, immutable exact creative scope |
| Sandbox social/email | Existing `CampaignPublicationService`, `SyntheticAudienceEmailService` | End-to-end simulated publishing with independent approval, mock consent and **zero remote posts or real email messages** |
| Agent/learning/performance | Existing BrainRun ledger, LearningSignal and MarketingMetricObservation owners | Real 13-agent offline run, quarantined research/learning, and independently reviewed reported observations without causal ROI claims |
| Acceptance | **One** R3-L 500-case register + strict detached production Ed25519 verifier | Add real-stack execution/role evidence, then generate unsigned, operator-ready 500-case handoff without pretending it passed |

## Actual staging topology exercised in CI

- Node production build of Next on localhost 3100, served through an ephemeral localhost TLS terminator on **3443**, enforcing the browser's real `__Host-` Secure cookie behavior.
- Compiled Nest API on localhost **3210**, with `NODE_ENV=production` and real OIDC authorization and database session/role validation. The missing production HTTP adapter `@nestjs/platform-express` is a new explicit API dependency; startup is exercised, not inferred from unit tests.
- Ephemeral localhost HTTPS JWKS on **3215** and localhost test-only token issue control on **3216**, with a newly generated **RS256** signing key. The token represents disposable Microsoft Entra-**shaped claims**; **no Microsoft Entra environment or real federated sign-in** is used. Nest's production verifier and API gate remain unchanged.
- Actual PostgreSQL 16 with schema migrations, exact disposable two-tenant identities and brand, executed as separate **marketing_r3y_runtime** SQL role with `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`. Real row-query checks prove 3 tenant A users, 1 tenant B user, and zero users visible without a tenant context.
- Real provider accounts, secrets, platform exports, model inference, live analytics, SMTP, real recipients and external publishing are absent. Production datasets are untouched.

## CI test coverage and integrity

There are **19 additional Chromium** tests against the *real API* and database, separate from **51 synthetic-owner Chromium** tests. They cover: approved brand source, creating persistent workflow and reloading the real ledger, human campaign self-approval denial, 13-agent offline ledger, browser-generated real PNG and media readback, viewer permission denial, absent creative approval and unauthorized real publish, independent creator/reviewer social sandbox lifecycle, consent-gated synthetic email with zero sends, model budget, quarantined research, noncausal KPI review, inert destination registration, foreign-tenant signed token denial, invalid JWT denial and stolen revoked session denial.

Strict same-run report checks prove 19 real Chromium executions (not just test-source markers), plus 51 prior browser cases, 91 actual PostgreSQL owner assertions, and 123 other offline/BFF checks: **284 engineering assertions mapped out of the 500 planned acceptance cases**. **216 cases remain unmapped**.

The CI gate continues to require the full existing migrations, 46/46 FORCE RLS census, staged preflight, no provider credentials, canonical tenant-isolation checks, penetration-related negative tests, disposable DR rehearsal and the fail-closed `NOT_CERTIFIED` verdict.

## Independent QA handoff — ready as a structured checklist, not a signed result

`scripts/quality/r3y-operator-handoff.mjs` creates a 500-record, immutable-source-digest handoff from the **single** canonical case index. Every item includes the suite, engineering mapping, required evidence types, and **null** operator, environment, result, attachments, and independent signoff fields. No fake operator signatures, case passes, production access or independent production attestations are generated. The handoff requires real exact case steps, controlled staging deployment ID, independent human testers, audit/network/db proof, defect adjudication, five separate externally trusted Ed25519 signers, independent pentest, production PITR/restore and authoritatively authorized provider staging UAT.

**Important limitations:** GitHub Actions is an ephemeral representative test stack, not a permanent external staging deployment. A signed localhost JWKS is not real Entra. Independent QA, provider UAT, production validation, accessibility verification and disaster recovery observation have not happened. They cannot be marked complete by generating test code or manifests.

**Production verdict remains `NOT_CERTIFIED`; no real provider connections are enabled.**
