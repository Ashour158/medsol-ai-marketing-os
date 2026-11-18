# R1 Enterprise Foundation — Tenant Brand and Revocable Agency Scope (First Persistence Slice)

**Scope:** First executable database-backed R1 feature, not a completed commercial tenancy/IAM launch.

## Mandatory Reuse Map

- **Organization** is the existing tenant authority. No parallel tenant table or organization impersonation.
- **User / BootstrapAuthGuard / marketing-permissions.ts** remain the current identity and authorization gates. User roles are still fixed pilot roles; customer-configurable IAM and OIDC tenancy discovery are not done.
- **Brand** is a new tenant-owned brand identity table. It does **not** duplicate BrandMasterRevision: the existing approved Brand Master remains a tenant-level policy until per-brand policy migration is designed, reviewed and tested.
- **AgencyGrant** is a revocable scoped relationship between an agency tenant and a client brand, not a user account, app token, or permission to send.
- **AuditEvent** remains the sole audit owner. Brand creation, grant creation and revocation are transactionally audited.
- **Commercial policy** stays in \`packages/policy/src/commercial-scope.ts\`. AgencyGrant data can eventually feed that preflight only from trusted server-side identity, brand and entitlement resolvers.
- **OutboxEvent** is not extended yet because no external delegated action or consumer exists. Future role/agency revocation propagation must use the existing outbox/inbox with versioned events.

## Implemented operations and authorizers

| API endpoint | Permission | Effect |
| --- | --- | --- |
| GET /marketing/tenancy/brands | READ_TENANCY | Tenant-scoped brand list only |
| POST /marketing/tenancy/brands | MANAGE_TENANT | Creates tenant-owned Brand plus audit |
| GET /marketing/tenancy/agency-grants | READ_TENANCY | Lists only grants issued by authenticated client tenant |
| POST /marketing/tenancy/agency-grants | MANAGE_TENANT | Creates finite revocable grant to an existing agency/brand; audited |
| POST /marketing/tenancy/agency-grants/:id/revoke | MANAGE_TENANT | CAS-fenced revocation; idempotent audit-once replay |

Only current \`ADMIN\` and \`SUPER_ADMIN\` have \`MANAGE_TENANT\` and \`READ_TENANCY\`. A CMO/Marketing Director cannot create agency grants. The source tenant is always resolved from the authenticated, verified session; arbitrary client organization IDs supplied in requests are ignored. Next.js BFF also exact-allowlists the route names and methods.

No external side-effect, brand policy approval, database role, permanent membership, paid media privilege, social posting, contact export or connector credential is granted by these operations.

## Tenant/brand/agency invariants

1. Unique \`(organizationId,slug)\` Brand identity within the client tenant.
2. Brand is a child of exactly one Organization. \`AgencyGrant(clientOrganizationId, brandId)\` has a **composite foreign key** to \`Brand(organizationId,id)\`. An agency's own brand cannot be inserted as a client's brand even by direct SQL.
3. Agency and client tenant cannot be identical; database check protects against direct mutation.
4. Actions only \`CAMPAIGN_READ\`, \`ASSET_DRAFT\`, \`REVIEW_COMMENT\`, \`REPORT_READ\`. These are internal scope descriptions, **not yet applied to underlying campaign/asset/read APIs**. There is no implied publishing privilege.
5. Grant expires after at least one hour and at most 90 days; revoked grants fail scope resolution and cannot be silently reactivated. A new grant lifecycle needs an approved future migration/reissuance workflow; no status flip without audit.
6. Scope resolution requires both an active matching grant **and** an enabled agency user with an allowed existing role; a grant row alone is insufficient. No cross-client data API is exposed by this tranche.
7. Revocation changes status only via optimistic version/state check and writes the audit in the same transaction. Replayed revoke is a no-op. Grant cannot be deleted through public API.
8. No data is shared across tenants by default; all reads and writes include organization scope. These application predicates do not yet constitute PostgreSQL RLS.

## Known gaps and gate before a commercial release

- **RLS:** No Postgres row-level security added to the existing tenant tables; phased migration and transaction-local trusted context, no BYPASSRLS runtime role and pool reuse tests are mandatory.
- **IAM:** Organization still uses static configured tenant and fixed user roles. Self-service organization, custom role policies, external agency identity binding, revocation invalidation and subscription entitlements remain missing.
- **Brand governance:** BrandMasterRevision, Campaign, Product, metrics and Approval do not yet have per-brand scope FK. The new Brand row is identity only; must not be misrepresented as an active per-brand Brand Master.
- **Commercial preflight:** \`authorizeCommercialScope\` is tested as a pure policy contract, but not yet invoked on all API/worker external effect paths with trusted DB records.
- **Race/abuse:** Add cross-process actor permission revocation, replay, quotas, rate limiting, audit integrity and stale session invalidation under real multi-tenant staging.
- **UX:** No new Settings Center manager UI. The admin-only APIs exist behind the existing BFF and can be exercised in an authenticated integration environment; guided agency/client onboarding remains WF41 future work.
- **Security:** Existing dependency advisory issue #4, external security audit, tenant retention and contractual data processing agreements remain release blockers.

## Acceptance evidence

- \`tenant-brand.test.ts\`: slug, actor scope, unsupported grant, revocation and roles.
- \`postgres-tenant-brand-agency.integration.test.ts\`: two distinct organizations and agency admin, brand uniqueness, wrong client brand denial, internal delegated read-only resolution, forbidden paid-media scope, revoke + idempotent audit.
- CI must apply the additive migration to both a fresh database and historical baseline, verify Prisma schema drift, run all TypeScript/tests/build.
- Do not claim production ready without two-tenant OIDC login, RLS, agency-staff role/brand authorization wired into actual business read APIs, and reviewed UX.

## Next precise implementation milestone

R1B: add \`Membership\`/\`RoleDefinition\`/\`RoleAssignment\` or a justified extension of existing User (no shadow subject); integrate tenant resolver and explicit agency delegation into API authorizers, then Postgres transaction-local RLS on a phased, backward-compatible migration. R1C: immutable exact-version ApprovalService and versioned DAM. R2 remains blocked for external publishing/email until all R1 relevant gates pass.
