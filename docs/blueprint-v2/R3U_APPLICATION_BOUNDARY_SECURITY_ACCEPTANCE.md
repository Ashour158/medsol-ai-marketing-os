# R3-U — Authenticated Application E2E Boundaries and Security Matrix

**Engineering tranche | 20 November 2026 | Release NOT_CERTIFIED**. No real provider accounts or external customer delivery.

## Reuse Map

| Concept | Canonical owner reused | Security/acceptance extension |
|---|---|---|
| Web request routing | Existing Next BFF `apps/web/src/app/api/marketing/[...path]/route.ts` | Fix missing campaign POST paths, reject untrusted route segments before URL normalization, cap actual body bytes and query length, preserve encrypted cookie and same-origin |
| API policy | `BootstrapAuthGuard`, `marketing-permissions.ts`, `TenantRolePolicyService` | Inventory ALL 145 controllers and require explicit method/route permission; deny all destructive/unregistered methods; test current DB role ceiling |
| Sessions | `AuthSessionService`, `AuthSession`, `PrismaService.withMarketingTenant` | Real PostgreSQL OIDC-identity simulation with actual session rows; wrong tenant, foreign session, changed role, revoked/expired/missing session fail closed |
| Marketing journey | Existing R3-O `OfflineCampaignJourneyStudio` / `MarketingReadService` | Do not replace any owner. All 142 marketing BFF route contracts are exercised in-process; existing actual-PG end-to-end marketing lifecycle remains in CI |
| Acceptance evidence | Same `r3l-acceptance-case-index.mjs`, `r3n-tenant-rls-inventory.mjs` and signed release verifier | 20 new case markers (12 BFF/unit + 8 real-PG), no second acceptance database or unsigned production signoff |

## Implemented coverage (strictly classified)

- **142 authenticated BFF route requests** replayed through the actual Next handler using an encrypted session and a mocked *internal* API response. Includes formerly missing POST /marketing/campaigns and /marketing/campaigns/transition. All forwarded requests assert tenant and session header authority; no external network call.
- **145 API route registrations** checked against the existing one-owner method-specific permission registry. Manager-only mutations, unknown provider sends, unknown methods, mass deletion and unregistered routes are denied.
- **Real PostgreSQL guard tests** use the actual `BootstrapAuthGuard`, `AuthSessionService`, tenant role policy, registered user rows and auth sessions. Only upstream OIDC signature exchange is substituted with synthetic identities. A real Entra environment has NOT been connected.
- Invalid/expired cookies, CSRF origin, forged cross-tenant headers, traversal/encoded separators, oversized POST bodies, overlong query strings, unknown routes and leak of cookie to upstream are rejected at the BFF boundary.

**Acceptance index after implementation:** **177 mapped engineering assertions** (123 offline or simulated BFF/unit checks, 54 PostgreSQL integration cases), **323 unmapped** planned slots, **0 independently executed/signed E2E cases**. The many parameterized route trials do not become independently signed E2E simply because one registered engineering test loops over endpoints. Same-run CI success is required for mapped status CI_ASSERTED.

## Important exclusions

R3-U does not: connect any real Microsoft Entra tenant, call a production model or publisher, send emails, create independent operator credentials, perform an external security penetration test, verify production least-privileged DB credentials, prove production PITR/RTO/RPO, or collect production-bound signatures. The independent release verifier will continue to reject production certification without ALL 500 signed E2E, pentest, operator and provider UAT records.

## Next engineering priorities

Extend cross-persona UI/browser automation beyond the in-process Next handler, verify 500-case scenario coverage with operator-authored staging execution logs, formally test providerless production-like chaos and client-specific accessibility. No automatic external effects or AI self-signoff.
