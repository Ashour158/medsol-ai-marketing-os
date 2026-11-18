# Phase 3 — Production Intelligence, Governance and Command Center

**Engineering status:** Implementation committed. CI result for the latest commit must be checked separately; passing CI is necessary but is **not** production or live-provider acceptance.

## Reuse Map / domain ownership

| Concept | Single authoritative owner | Extension made |
|---|---|---|
| Agent capabilities and policy | AgentRuntime / AGENT_ROSTER | Tenant-scoped Agent installations and execution FK |
| Brain runs, state, checkpoints | BrainRunLedgerService / BrainRun | Read-only incident and workflow visualization |
| Event delivery | Existing OutboxPublisherService and InboxEvent | Reused; no parallel event bus |
| Product, objectives and campaigns | Existing MarketingCatalogService/MarketingReadService | Campaign KPI FK with source evidence |
| Scientific learning and trends | MarketingLearningService/LearningSignal | Reused, no invented scientific verification |
| Model budget and billing | ModelBudgetService/ModelReconciliationService | Separate estimated and independently verified amounts |
| Brand policy | BrandMasterRevision / BrandMasterService | Versioned, independently approved primary owner |
| Marketing performance | MarketingMetricObservation / MarketingPerformanceService | New domain for facts absent in the prior schema |
| Operational read model | MarketingCommandCenterService | Read-only composition of owner services |
| Human identities and permissions | BootstrapAuthGuard, marketing-permissions | Manager-only audit and release decisions |

### Implemented changes

1. **Tenant-safe agent identity:** Agent primary key is now `(organizationId,id)`, where `id` is the manifest identifier. AgentExecution references both columns. Agents are installed from the code-reviewed roster within each organization; PAUSED or RETIRED states are respected. A PostgreSQL integration test runs the same logical agent under two independent tenants and checks cross-tenant FK denial.
2. **Operational Command Center:** GET `/marketing/command-center` composes Brain runs and intervention/staleness alerts, delivery dead letters, approvals, skill decisions, agent execution metrics, budget status, brand status and reviewed trend topics. Manager audit permission is required. A responsive web console supplies incident investigation links, evidence intake, governed skills and independent brand decisions.
3. **Model cost separation:** `ModelUsage.actualMicros` and `ModelBudget.spentMicros` remain pricing-derived policy estimates. New `billingStatus`, `verifiedBilledMicros`, `billedEvidenceReference` and `billedVerifiedAt` fields store independently verified billing. `ModelReconciliationService.verifySettledInvoice` is an **internal-only** method requiring upstream authentication of provider billing. Concurrent invoice conflicts are rejected; overages are surfaced for finance without silently rewriting policy estimates. The Command Center displays both amounts.
4. **Authoritative Brand Master:** `BrandMasterRevision` versions are proposed with structured voice/color/prohibited claims/disclaimers and a source reference. A different authenticated manager must approve or reject the revision. Older-than-active approvals are denied. Approved brand context is loaded for Brain runs; user-provided brand version strings cannot impersonate it. Free-text CRM consent references are not accepted as proof of consent.
5. **Marketing performance evidence:** `MarketingMetricObservation` is the sole source of campaign performance facts, with source-system record IDs, source references, dated metrics and quarantine. Human review must be by a different actor. Database FKs enforce `(organizationId,campaignId)` correspondence; source-key collisions prevent silent duplication. Only reviewed records contribute to CTR, click-to-lead rate and spend-micros/lead; missing denominators produce null rather than fabricated rates. No multi-touch attribution or independent source attestation is claimed.
6. **Brain intelligence wiring:** Optional `campaignId` resolves a tenant-owned performance summary. Reviewed KPI observations flow through the existing Brain context to all 13 agent work packages; each package retains source status and human-approval boundaries. The Command Center offers campaign KPI views, source submission and independent review.
7. **Migration readiness:** CI uses `prisma migrate deploy`, live schema diff and historical baseline upgrade rehearsal. Fresh deployment and simulated initial-schema upgrade are covered; arbitrary legacy production drift still needs a per-deployment reconciliation plan.

### API / Web endpoints

- `GET /marketing/command-center` — manager audit snapshot.
- `GET /marketing/brand/active`, `GET /marketing/brand/revisions` — approved brand and revision history.
- `POST /marketing/brand/propose`, `POST /marketing/brand/decide` — independent, audited governance.
- `GET /marketing/performance/observations`, `GET /marketing/performance/campaigns/:id` — evidence and reviewed KPI summary.
- `POST /marketing/performance/ingest`, `POST /marketing/performance/review` — quarantine and independent approval.
- Existing `brain/runs`, `brain/assess`, `learning/skills`, `learning/discover`, `operations/delivery`, `agents/budget` remain their respective authoritative owners.

### Release acceptance tests

- Database: validate migration chain from empty database and historical baseline; verify historical data preservation. Before upgrading an existing installation, check for AgentExecution rows whose tenant differs from the referenced legacy Agent tenant and resolve explicitly rather than guessing.
- Identity: confirm OIDC manager/operator/viewer authorization, session expiry, cross-tenant denial, and brand/metric two-person reviews. Entra registration remains deferred as requested.
- Agent operation: run all 13 agents in two tenants; pause only one tenant's agent and verify no effect on the other.
- Evidence: attempt ingestion with foreign campaign ID, duplicate source ID with conflicting value, negative KPI, fabricated HTTPS claim, self-review, and unreviewed KPI in reports. All must fail closed or remain quarantined.
- Model finance: confirm price-based cost estimate and independent invoice value appear separately, invoice conflict detection, and finance exception where billed exceeds estimated. No live payment or spend is authorized.
- Brain: create and run campaign-context plan, inspect evidence-linked metric quantities and sources, verify no automatic publishing or skill activation. Exercise worker crash after model request and before checkpoint.
- Command Center: review stale RUNNING/NEEDS_INTERVENTION runs, dead letters, budgets, brand approval, reports and governance flags. Verify OIDC audit access.
- Production: load test, authenticated provider integration, operational observability, on-call escalation, controlled rollback, real channel/CRM analytics and scientific reviews.

## Dependencies and honest limits

**Ready in code / CI tested once the latest run is green:** Tenant agent authority, single-owner read model, Brand Master two-person workflow, manual source-backed performance KPI review, budget/billing separation, command controls, migrations and regression tests.

**Not yet live-validated:** Full Entra identity configuration, external provider invoice authentication and automated billing ingest, production database migration, real marketing channel/API credentials, official company brand/evidence corpus, large-scale distributed worker recovery, continuous source monitoring, scientific claim verification, privacy/licence acceptance, or production deployment. A record marked human REVIEWED is not proof of independent scientific accuracy.

**Next production gate:** Execute a live staging acceptance suite with approved OIDC, provider sandbox, official Medsol brand master and real analytics exports; then implement channel adapters and verified attribution after security/consent/privacy review. Do not enable external publishing, advertising spend, customer messaging, self-modifying agents or unreviewed claims prior to those gates.

**No Zoho dependency:** This remains a standalone AI marketing department, as required.
