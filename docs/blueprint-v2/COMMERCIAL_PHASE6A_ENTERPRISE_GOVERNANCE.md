# Commercial V1 — 6A enterprise governance hardening

Base: validated Phase 4 main 1841041a2a825c978ff5e42ca02261efb9d32fa8. Phase 5 #168 still requires combined acceptance. This independent tranche must not merge ahead of Phase 5.

## Reuse map and change
Existing TenantBrandService owns the AgencyGrant and exact brand-scoped campaign read. Existing TenantRolePolicyService owns provisioned OIDC user and restrictive custom roles. No new memberships, roles, grant authority, tables or routes. Delegated campaign reads now lock the current actor and, where present, restrictive role, then apply the canonical permission predicate inside the same serializable tenant-scoped transaction as the existing locked agency grant and campaign query. A separate authorization transaction no longer supplies the decision. A concurrent change must serialize or fail; no automatic replay of a denied read. Existing metadata-only scope resolver is not a resource-read authorization token.

Extend existing real PostgreSQL T01-005: provision an agency viewer, assign exact restrictive READ_PORTFOLIO role, create session, read only delegated campaign, disable role and verify session revocation and immediate denial while the client grant and other authorized operators remain active, then revoke client grant and verify denial. No real customer records or external effects. CI must validate the exact merged-base candidate, including runtime permissions and existing isolation tests. Independent operator acceptance remains open.

## Remaining commercial scope
6A broader subscription/entitlement and offboarding lifecycle; 6B governed agent factory and team assembly; 6C complete provider lifecycle and commercial workflows; 6D independent 500-case acceptance, hosted security and release controls. Commercial target completeness is not implied by this tranche. No billing, live provider activation or hosted release authorized.
