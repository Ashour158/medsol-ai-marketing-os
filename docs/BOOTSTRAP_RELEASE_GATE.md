# Single-tenant bootstrap release gate (NOT multi-tenant production)

## Required environment
- DATABASE_URL: PostgreSQL URL
- MARKETING_BOOTSTRAP_ORGANIZATION_ID: an existing Organization.id
- MARKETING_BOOTSTRAP_TOKEN: a unique high-entropy secret (minimum 32 random bytes recommended)
- PORT: optional, defaults to 3001

All marketing API calls except GET /health require Authorization: Bearer <MARKETING_BOOTSTRAP_TOKEN>.
The organizationId in request bodies and x-organization-id header must match the configured organization. The global guard enforces this before controllers run. Do not expose the bootstrap token in browser JavaScript or frontend bundles.

## Known release blockers
1. GitHub Actions jobs have repeatedly failed without starting steps; investigate repository Actions runner/billing/policy settings using the GitHub Actions UI. No green build has been observed.
2. This bootstrap credential represents a single trusted server-side operator, NOT individual authenticated humans. The approval endpoint currently accepts approverUserId from the request; do not expose it to untrusted callers. Replace with signed OIDC/JWT user identity and per-role authorization before public access.
3. Integration tests against a disposable PostgreSQL database and migration verification are required.
4. RUNNING workflows cannot be recovered without a stale-execution lease; FAILED workflows have a recovery endpoint.
5. Scientific and brand review gates, remaining agents, production transport, and operator UI are not complete.
6. No marketing content should be published autonomously until evidence, brand, approval, and publishing controls are implemented and verified.

## Minimum smoke-test plan
- Start API with missing token: startup must fail.
- GET /health: returns status without token.
- POST /marketing/workflows without token: 401.
- Same request with wrong token: 401.
- Valid token with another organizationId: 403.
- Valid token, correct organizationId and seeded objective: workflow should reach WAITING_APPROVAL.
- Simulate a failed workflow and POST /marketing/workflows/:id/resume; verify completed steps do not execute twice.
- Test duplicate approval command, rejected approval, and unauthorized approver.
- Run tests and build with Node 22, pnpm 10.12.4, PostgreSQL and Prisma client generated from prisma/schema.prisma.

Do not claim production readiness until these gates pass.
