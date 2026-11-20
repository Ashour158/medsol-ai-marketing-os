# R3-Q2 — Event, FinOps and Incident Ledger Isolation Closure

**Status:** Engineering implementation; production **NOT CERTIFIED**. No real provider accounts or external social/email dispatch.

## Mandatory Reuse Map

| Business concept | Existing authoritative owner reused | R3-Q2 change | Forbidden |
| --- | --- | --- | --- |
| Tenant context | `PrismaService.withMarketingTenant` | Every affected query/write uses tenant-local transaction; never pooled-session SET | Shadow tenant authority or BYPASSRLS runtime |
| Command idempotency | `CommandReceipt`, `CampaignService`, `ApprovalService` | FORCE RLS and scoped command replay | Duplicate command ledger, replaying externally uncertain outcomes |
| Audit evidence | `AuditEvent` | FORCE RLS SELECT/INSERT; no app update or delete | Audit rewriting or self-certification |
| Inbox/outbox | `InboxEvent`, `OutboxEvent`, `InboxService`, `OutboxService`, `OutboxPublisherService`, `DeliveryOperationsService` | FORCE RLS; tenant-scoped event producer/consumer; enumerate canonical Organization for fair bounded workers; explicit tenant for terminal checkpoints | New broker/event table per feature, unscoped worker scan, blind retry of remote effects |
| Model cost and reconciliation | `ModelBudget`, `ModelUsage`, `ModelBudgetService`, `ModelReconciliationService` | FORCE RLS; tenant-local reservation/settlement/invoice verification and summary | Billing-as-fact for offline estimates, separate per-agent budgets |
| Incident operations | `IncidentResponse`, `MarketingIncidentResponseService`, `MarketingCommandCenterService` | FORCE RLS; exact tenant response/reporting and existing escalation logic | Shadow incidents, automatically replaying uncertain side effects |
| QA and release | `r3n-tenant-rls-inventory.mjs`, `r3l-acceptance-case-index.mjs` | CI **fails** if any of the 46 discovered tenant-relevant tables lacks FORCE RLS/policy; mapped 152/500 engineering cases, 0 operator-signed E2E | Fabricating production environment audit or external signoff |

## Database and migration

`20261120060000_r3q2_event_finops_incident_rls` applies `ENABLE` and `FORCE ROW LEVEL SECURITY` to final seven existing tenant tables: `AuditEvent`, `CommandReceipt`, `InboxEvent`, `OutboxEvent`, `ModelBudget`, `ModelUsage`, `IncidentResponse`. Every policy restricts `organizationId` to the trusted transaction-local `app.marketing_tenant_id`. The append-only app evidence tables permit SELECT/INSERT but no UPDATE/DELETE, and no application DELETE is opened in any of the seven. Historical rows are not altered.

The existing R3-P production runtime startup guard forbids PostgreSQL `SUPERUSER`, `BYPASSRLS`, `CREATEROLE` and `CREATEDB`; migrations must run under separately controlled credentials. A clean disposable PostgreSQL CI census is not proof that production database role and every deployed worker are independently audited.

## Real PostgreSQL proof

- **T01-014:** a non-BYPASSRLS principal sees 0 rows without context, exactly one row from each of 7 domains with tenant A/B context, and cannot modify audit/command receipts or inject records under a missing tenant.
- **T15-025:** the canonical publisher processes two tenants' offline internal events via tenant-scoped claims and marks receipts, without any provider credential/remote publication, while the Inbox terminal checkpoint rejects foreign tenant and double completion.
- **T14-002:** two tenants' model budget/usage are isolated, a foreign settle is denied, and the accepted offline estimate is **not** an independently verified provider bill.

CI must pass 46/46 actual tenant-table FORCE RLS, real database migrations from both clean/historical database, Prisma drift, 152 mapped engineering assertions (111 offline unit +41 PostgreSQL), recovery drill, typecheck, full build, security SBOM. Independent signed 500 E2E **0**. The cryptographic release-certification gate remains fail-closed.

## Release readiness

**NOT CERTIFIED:** full production security assessment/pentest, incident on-call and SRE operational runbook approval, production PITR/RTO/RPO, real provider staging UAT (intentionally deferred), independently operated 500-case cross-role browser E2E, real customer data retention/privacy jurisdiction compliance, and legitimate provider entitlements. No accounts are connected; no actual post or email is sent.

**Next:** R3-R deepened simulation, reproducible multi-scenario campaign operations, audited replay, role-based guided UX and governed learning from synthetic feedback using **only the existing** WorkflowExecution/WorkflowStepExecution, DAM, Approval, CampaignPublication, SyntheticEmail and Knowledge owners.
