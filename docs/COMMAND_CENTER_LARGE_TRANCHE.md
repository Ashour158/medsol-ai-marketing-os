# Large tranche: Marketing Command Center and governed operations

## Implemented
- Tenant-scoped operational KPIs: campaigns, active objectives/products, running workflows, pending approvals and failed agent executions.
- Read-only campaign portfolio and detail with campaign approvals and audit history.
- Objective and product selectors, recent workflow list and agent execution history.
- OIDC-verified identity endpoint; user-bound approve/reject decisions with mandatory rationale.
- Marketing objective creation with a privileged, verified role and an audit record in the same transaction.
- Tenant filtering and access-control regression tests.

## Authority and security
- Authoritative campaign state stays in CampaignService and ApprovalService. Dashboard endpoints are read models only.
- ApprovalService still enforces permitted reviewer roles, transactional decision compare-and-swap and campaign status transition.
- Shared bootstrap tokens cannot approve campaigns or create objectives.
- No channel publishing has been enabled.

## Limitations and next release gates
- Dashboard still accepts manually entered bearer tokens; implement OIDC authorization-code with PKCE and secure server-side sessions before public deployment.
- Read models are capped at 100 rows; add cursor pagination, search and sorting for production.
- Add PostgreSQL-backed integration tests for campaign creation, tenant isolation, approval race conditions, outbox, workflow recovery, and real HTTP authentication.
- Add per-route permission policy for sensitive reads and campaign actions, not only organization checks.
- Verify an actual OIDC issuer and JWKS configuration in staging.
- Add deployment, monitoring, migrations, rate limiting and security testing. Passing unit tests and builds does not establish production readiness.
