# R3-V — Chromium multi-persona simulated UI journey and accessibility/security acceptance

**Engineering tranche, 20 November 2026. Release verdict: NOT_CERTIFIED.**
No real Entra ID, AI provider, MCP credentials, social accounts, live emails, or external analytics.

## Reuse Map

| Concern | Existing authoritative owner | R3-V addition |
|---|---|---|
| Frontend | \`apps/web/src/app/page.tsx\`, \`OfflineCampaignJourneyStudio\` | Browser interactions only, no replacement workspace |
| Authentication and API boundary | \`marketing-auth.ts\`, existing encrypted session, Next BFF \`[...path]/route.ts\` | Chromium injects disposable properly sealed test cookies; **no production test-login route or auth bypass** |
| Business-state transitions | Existing Workflow/Brain/Campaign/Approval/Creative/Publication/Email/Learning services and PostgreSQL suites | Deterministic localhost-only UI fixture provides interface responses, not authoritative business execution |
| Consent, social, learning | Canonical engines and human approval | Browser verifies visible virtual outcomes and no real sends; actual PostgreSQL integration tests remain separate |
| Release evidence | One R3-L 500-case index and independent production certification verifier | 17 distinct executable \`test('Txx-yyy ...')\` browser case slots; no second release register, no synthetic operator signatures |

## Actual browser coverage

\`apps/web/e2e/marketing-journey.pw.ts\` executes **17 Chromium browser cases** against a real running Next.js app. A private process-local upstream fixture listens exclusively on \`127.0.0.1:3209\`, and Next binds \`localhost:3100\`; the BFF uses its normal encrypted cookie session and actual authenticated route handler. This covers: anonymous denial; admin and viewer role-affordances; objective/campaign workflow, offline agent trace, actual Canvas PNG and alt text; attempted self-approval; mobile viewport; keyboard interaction; sign-out/revocation; CSRF denial; unavailable external send routes; foreign-tenant cookie rejection; header-injection rejection; synthetic consent and zero-send email; quarantined learning; and multi-persona independent approval culminating in a **SANDBOX** social attempt.

Each fixture call checks a synthetic Bearer token, tenant ID, and session ID. It never attempts real provider egress and never uses production credentials. Browser assertions use simulated backend responses; **they do not prove the corresponding PostgreSQL, provider, or actual business transitions**. Those are verified separately by the existing integration suites, and still need signed independent UAT.

## Same-run automated gate

GitHub Actions now installs Chromium and executes the browser suite **before** acceptance indexing. The single canonical 500-slot register checks exact test markers and runner files, and emits its CI-asserted result only when unit tests, real disposable PostgreSQL migrations/integration tests, the RLS census and the browser step have all succeeded in that run. The release-certification script remains independent and fail-closed.

**After R3-V coverage mapping** (conditional on green CI): 123 offline/BFF engineering slots + 54 real PostgreSQL slots + 17 Chromium browser slots = **194 engineering-asserted cases**, with **306 planned slots not mapped**, **0 independently signed 500-case E2E records**. 46/46 tenant-owned tables FORCE RLS in disposable CI is not a production-tenant penetration test.

## Outstanding production gates

Independent 500-case staging execution/signatures, production-role RLS verification, genuine Entra rollout and recovery/rotation testing, independent pentest, real PITR/RTO/RPO exercise, provider-entitlement staging UAT once explicitly authorized, human accessibility audit, and operational acceptance. **NOT_CERTIFIED** is intentional until these are independently verified.
