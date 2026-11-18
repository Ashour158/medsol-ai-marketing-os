# Major tranche: independent human approvals and PostgreSQL integration validation

## Implemented
1. Independent approval gate. ApprovalService checks the authoritative campaign audit trail inside the decision transaction. Human campaign authors and status submitters cannot approve their own campaign. Missing creation provenance fails closed. Agent-generated campaigns can be approved by a separately authorized human reviewer.
2. Segregation tests cover self-approval, submitter conflicts, independent reviewers and missing provenance.
3. Real PostgreSQL CI service using PostgreSQL 16, isolated test database and Prisma schema push.
4. Database integration test executes real campaign creation, command receipts, outbox emission, state transitions, R2 approval creation, cross-tenant access denial, self-approval denial, independent approval, replay, conflicting decisions and final campaign/audit state.

## CI
The PostgreSQL database is ephemeral and created by GitHub Actions. The integration test only runs when MARKETING_DB_INTEGRATION=1. Never set this variable against a production database. Schema push is permitted only in isolated CI; production deployments require reviewed Prisma migrations.

## Unresolved
- Interactive OIDC authorization-code + PKCE login and server-owned sessions are not yet implemented; the current browser requires manual bearer tokens.
- Production-grade separation of duties should also cover delegation, impersonation, temporary grants, provenance migrations and conflict of interest policies.
- Add real HTTP end-to-end tests and a multi-tenant provisioning model; current application remains single-tenant configured.
- Add production session management, CSRF, logout, refresh rotation, rate limiting and observability before public access.
- No autonomous publishing is enabled.

## Release criteria
Do not label production ready until CI is green, staging identity provider and database are exercised, all permission policies are tested and an independent security review is completed.
