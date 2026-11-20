# R3-R FinOps — Tenant FORCE RLS and Reconciled Budget Transactions

**Engineering tranche, 20 November 2026. Release remains NOT_CERTIFIED.**
This change does not activate a provider, infer a real invoice or send a customer message.

## Mandatory Reuse Map

| Authority | Reused canonical owner | Delta |
|---|---|---|
| Tenant context | `PrismaService.withMarketingTenant` | One `SET LOCAL` transaction context per finance operation, pooled-safe |
| Budget / reservation | `ModelBudgetService`, `ModelBudget`, `ModelUsage` | FORCE RLS for SELECT / INSERT / UPDATE and transactional reserve / settle / summary |
| Invoice evidence | `ModelReconciliationService` | Reuse authenticated evidence and immutable verified invoice fields, never automatically adjust estimated spend |
| Brain recovery | `BrainRunLedgerService` | Existing R3-Q tenant-scoped model usage evidence remains read-only, no automatic replay |
| Acceptance | Single 500-case register and R3-N PostgreSQL census | Add two real PG cases; no second ledger or fabricated independent signoffs |

## Database and execution contract

Migration `20261120060000_r3r_finops_rls` adds FORCE RLS to `ModelBudget` and `ModelUsage`. Blank or missing `app.marketing_tenant_id` means zero visible rows for non-BYPASSRLS roles. Only matching tenant rows may be inserted or updated, and neither table has DELETE RLS. Authorization remains with verified OIDC and canonical roles; DB scope is a second boundary. Full billing verification requires separately authenticated provider invoice evidence, which is **not** available here.

Production runtime must use the existing checked nonprivileged DB role. Model budget settlement and verified invoice recording continue to use original canonical services. The estimate and independently billed fields remain separate; overage is flagged for finance instead of silently changing the estimate.

### Actual PostgreSQL acceptance cases

- `T01-014`: low-privilege two-tenant finance census, null context, pool reset, cross-tenant mutation denial, nondeletability and unscoped INSERT refusal.
- `T14-002`: canonical idempotent reserve / settle / verified synthetic invoice, independent budget summaries and foreign-tenant denial; zero real provider dispatch.

CI gates **29 named FORCE RLS tables**, expected **41/46 actual tenant-relevant tables** protected when R3-Q also merges. The authoritative 500-case evidence program maps **151 engineering assertions** (111 offline / 40 PostgreSQL), leaves **349 unmapped**, and has **0 independently signed E2E cases**. The actual CI inventory, not this document, determines measured state.

## Still blocked

Five uncovered authority tables remain after R3-Q and this change: `AuditEvent`, `CommandReceipt`, `InboxEvent`, `OutboxEvent`, `IncidentResponse`. Independent penetration testing, live production DR/PITR/RTO/RPO, signed operator 500-case E2E, provider staging UAT, and real accounts remain deliberately unresolved. Release **NOT_CERTIFIED**.
