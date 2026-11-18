# R1B — Tenant-scoped restrictive roles and first PostgreSQL FORCE RLS slice

**Scope of implementation:** new tenant-owned role profiles that can only **remove** permissions from the existing `User.role` ceiling; no new User/member identity table, no shadow policy engine. One first RLS-protected table; **not** all-business-table RLS, self-service multi-tenant provisioning or a production commercial IAM certification.

## Reuse Map
- `Organization`: existing tenant authority.
- `User`: sole local provisioned human/OIDC identity; a nullable `tenantRoleDefinitionId` references one role **in the same tenant** through a composite FK.
- `marketing-permissions.ts`: sole route-to-business-permission catalog and legacy ceiling for each built-in role.
- `BootstrapAuthGuard`: sole API-wide request gate. In OIDC mode it now calls `TenantRolePolicyService.assertActorPermission` on **every mapped route** after verifying OIDC, session, baseline role and tenant.
- `TenantRoleDefinition`: **new restrictive custom role specification**; not a duplicate User role or new membership authority. The table has explicit tenant RLS and is never used to grant permissions above `User.role`.
- `AuthSession`: existing session owner; reassignment and disabling a role invalidates affected active sessions.
- `AuditEvent`: existing audit authority. All role changes are transactionally written here.
- `TenantBrandService` and `AgencyGrant`: unchanged. This role does **not** authorize cross-client data access or automatically activate agency grants.

## Enforced behavior
1. Admin/Super Admin with existing OIDC binding may create a named, **immutable-permissions** role. Changes require a new role and reviewed reassignment; no in-place permission escalation or deletion API.
2. Non-admin provisioned, enabled OIDC users may be assigned a role only if each new permission is already allowed by their existing `User.role`. Admin/Super Admin and self-assignment are refused.
3. Assignments and role disable operations update the existing User/role and revoke sessions **inside the same database transaction**; no stale, otherwise valid session may continue after policy change.
4. Every OIDC protected request checks the current persisted `User` role, OIDC subject, disabled status, and assigned profile. A missing, disabled, inaccessible or insufficient profile denies the request. Existing `User.role` is an unbreakable ceiling.
5. Pilot legacy users without an assigned custom role retain the existing built-in role until migration. To require assignment for non-admin users, set `MARKETING_REQUIRE_TENANT_ROLE=true` **only after all existing users have been migrated and tested**.
6. The new `TenantRoleDefinition` table has PostgreSQL `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; policy matches `organizationId` to transaction-local `app.marketing_tenant_id`. Service uses `SELECT set_config(...,true)` inside a Prisma transaction and explicit organization predicates. No session-global tenant setting.
7. A realistic CI regression uses a **non-superuser, non-BYPASSRLS** temporary Postgres role; it demonstrates that absent context hides rows, tenant A context cannot read tenant B, and subsequent transactions do not retain the local tenant context. CI's database administrative user is a superuser and *cannot itself* serve as proof of RLS policy effectiveness.
8. The BFF exact-allowlists role operations; NestJS permissions restrict them to tenant admins. A request body cannot choose another tenant.
9. No role profile grants publication, external spend, consent override, privileged admin changes, model/tool use, or agency impersonation beyond the existing user ceiling.

## Implemented endpoints
- `GET /marketing/tenancy/roles` — tenant admin lists only their tenant role definitions.
- `POST /marketing/tenancy/roles` — create immutable role spec `{key,name,permissions}`, with audit.
- `POST /marketing/tenancy/roles/assign` — assign existing role to existing non-admin, provisioned user `{userId,roleId}`, revoke sessions, audit.
- `POST /marketing/tenancy/roles/:id/disable` — disable role `{reason}`, revoke assigned users' sessions, audit; repeated disable is an idempotent no-op.

## Tests and acceptance
- `tenant-role-policy.test.ts`: route permissions, invalid/duplicate privilege names, admin authority, cross-tenant safety, privilege ceiling, user state, current policy, disabled role, denial after session reassignment and strict opt-in.
- `postgres-tenant-role-rls.integration.test.ts`: two actual organizations and provisioned OIDC identities, custom role assignment, session revocation, effective permission denial, disabled policy, audit and true non-bypass RLS probe.
- Existing bootstrap pilot, oidc identity, marketing authorization, campaign and Brain tests must remain green.
- CI runs Prisma schema generate, migrate deploy, clean schema diff, historical expand/replay, all tests and application build.

## Known production blockers (do not claim commercial IAM readiness)
- Current OIDC issuer/organization mapping still uses one configured bootstrap organization and one Microsoft Entra issuer. True verified multi-tenant OIDC onboarding, external tenant membership and secure agency identity resolution remain separate implementation work.
- Per-brand ABAC has no persisted brand policy grants and existing Campaign/Approval/BrandMaster resources are still tenant-scoped rather than brand-scoped.
- **Only TenantRoleDefinition has RLS.** All existing campaign/approval/asset and tenant tables still require phased RLS, non-BYPASSRLS production database credentials, transaction-local scoped read/write owners, pooled-connection adversarial tests and migration rehearsal.
- Role creation/assignment admin UI, just-in-time provisioning, SAML/SCIM, policy versioning across tenant/brand, break-glass and last-admin safeguards still need implementation.
- Exact-version ApprovalService and DAM content/rights binding are pending R1C.
- Full commercial security review, tenancy/data-residency policy, entitlements, audited multi-process deployment and provider acceptance still block production.

**Next tranche:** R1B2 — verified multi-tenant OIDC tenant mapping and scoped roles/access in additional tenant business tables, implemented through the existing identity owner with no browser-selected tenant. Follow with R1C — exact content/asset version approvals.
