# T1B — Signed OIDC organization resolution for multi-customer tenancy

**21 November 2026.** Opt-in security foundation only, **NOT_CERTIFIED**.

## Reuse Map
- `BootstrapAuthGuard`, `verifyOidcIdentity`, `PrismaService.withMarketingTenant`, `AuthSessionService`, `TenantRolePolicyService`, `User`, `AuthSession` and existing FORCE RLS policies remain the sole authentication, membership, isolation and role authorities. No shadow user table or tenant resolver service.
- `@medsol/contracts/oidc-tenant` exposes one environment mode and signed-claim schema to Next callback and Nest API, avoiding divergent tenant semantics. Existing encrypted BFF cookie is reused; no user-supplied tenant selector or new session store.

## Implemented
- **Default FIXED:** unchanged explicit `MARKETING_BOOTSTRAP_ORGANIZATION_ID` with strict tenant header/body checks.
- **Opt-in SIGNED_OIDC_CLAIM:** set `MARKETING_TENANT_RESOLUTION_MODE=SIGNED_OIDC_CLAIM` on both web and API and **unset** `MARKETING_BOOTSTRAP_ORGANIZATION_ID`. Requires an exact `marketing_org_id` custom string claim in independently signed, validated OIDC **ID and access tokens**. It is read only after cryptographic issuer/audience/expiry/nonce or access-scope verification. The API separately verifies the JWT's tenant claim, then tenant-scoped active `User` OIDC subject membership and session via transaction-local FORCE RLS. Client body/header/org in encrypted cookie may only match, never select, a tenant.
- Bootstrap shared-token mode refuses multi-org configuration. Unknown modes, absent/bad/ambiguous claims, disabled users, stale sessions, and forged header/body tenants fail closed.
- Shared contract tests, auth-boundary negatives, callback configuration and OIDC scope tests; existing R3-Y single-tenant signed-local OIDC tests remain the default until a separate opt-in staging job is created.

## Limitations/next gate
No actual Entra configuration, IdP custom claims, operator login, permanent staging, cross-provider identity federation or tenant switch UI exists. These require independent signed-claim staging E2E and provider UAT. No real external account or email/social/AI effect is permitted. Security/operator signoff and independent 500-case QA remain open: **NOT_CERTIFIED**.
