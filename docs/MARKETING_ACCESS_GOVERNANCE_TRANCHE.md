# Marketing access governance tranche

## Authority model
A centralized, fail-closed permission registry maps each API route and method to a permission. Permissions are resolved from the authoritative organization-scoped User.role, not from arbitrary request fields or untrusted JWT role claims.

- VIEWER / USER / ANALYST: portfolio read access.
- MARKETING_SPECIALIST / MARKETING_MANAGER: portfolio, assessment, workflow execution and recovery.
- ADMIN / SUPER_ADMIN / MARKETING_DIRECTOR / CMO: the above plus campaign/objective management, approval inbox, audit detail and approval decisions.
- Unknown roles, unknown marketing routes and unsupported methods are denied.

## Bootstrap transition
The shared-token bootstrap mode is limited to portfolio reads and non-mutating objective assessment. It cannot start workflows, create objectives/campaigns, resume workflows, view sensitive approval/audit records or decide approvals. Operators must use OIDC for these operations. This is a deliberate breaking security change for pilot clients.

## Test coverage
- Pure policy matrix tests: default denial, sensitive operations, privileged role, unknown paths.
- Guard-level tests: bootstrap read-only limits, OIDC role denial, manager authorization.
- Existing approval service enforces reviewer roles and binds approval identity to OIDC user ID at controller boundary.

## Remaining production blockers
- Interactive OIDC authorization-code/PKCE, server sessions and CSRF protection.
- Real PostgreSQL integration tests, HTTP-level end-to-end tests and multi-tenant isolation checks.
- Segregation of duties (e.g. campaign author cannot approve own submission), approval delegation, role provisioning lifecycle.
- Structured actor provenance on campaign create/transition events; current campaign service records an agent actor.
- Rate limiting, pagination, monitoring, external integrations and deployment runbooks.

Do not activate external publishing until all release gates are independently verified.
