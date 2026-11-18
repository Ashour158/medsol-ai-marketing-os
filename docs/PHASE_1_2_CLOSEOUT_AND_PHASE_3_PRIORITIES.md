# Medsol AI Marketing OS — Phase 1 / Phase 2 Engineering Closeout Review
**Date:** 2026-11-18  
**Validated GitHub run:** #334 (passed, includes clean PostgreSQL migration deployment and schema drift verification) — https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44308316616

## Reuse Map: one owner for every business concept
| Concept | Authoritative owner |
| --- | --- |
| Agent capability and signed manifest | `packages/agent-runtime/src/roster.ts`, `AgentRuntime` |
| All 13 domain deliverables | `packages/agent-runtime/src/domain-work-packages.ts`, `MarketingDomainAgent` |
| Agent decision audit | `AgentService`, `AgentExecution` |
| Brain run and checkpoint ledger | `BrainRunLedgerService`, `BrainRun`, `BrainRunStep` |
| Brain dispatcher | `BrainDispatchWorker`, `BrainRunExecutorService` |
| Outbox delivery retry/backoff | `OutboxPublisherService` |
| Consumer idempotency and receipt | `InboxEvent`, `BrainHandoffConsumer` |
| Objectives and product catalogue facts | `MarketingReadService`, existing `MarketingObjective` and `MarketingProduct` |
| Evidence registry and trend brief | `MarketingLearningService`, `LearningSignal` |
| Public scientific metadata | `ScientificLiteratureConnector` (Europe PMC only) |
| Skill proposals and approval | `AgentSkillProposal`, `SkillReleaseService` |
| Model budgets and provider gateway | `ModelBudgetService`, `GovernedModelService`, `BoundedModelGateway` |
| Marketing role/tenant authorization | `BootstrapAuthGuard` and marketing permissions |

## Delivered / tested
- 13 of 13 registered governed agent engines. Each offers a distinct deliverable, domain steps, acceptance checks, KPIs, review owner and a reference list. Agent outputs are review-only plans, not independently proven scientific or business facts.
- Brain plan with 5 phases and handoff graph; tenant-scoped durable run and step ledger; compare-and-set claim; checkpoint proof; crash/uncertainty handling; explicit operator quarantine.
- Atomic checkpoint/outbox events; bounded existing outbox retries and dead letters; fixed event-type handoff consumer; transactional inbox and audit creation; duplicate receipts are idempotent.
- An optional polling worker (`MARKETING_BRAIN_WORKER_ENABLED=true`) dispatches pending runs. Same process can consume internal brain events unless `MARKETING_BRAIN_EVENT_DELIVERY_ENABLED=false`. Neither setting is enabled by default in the repository.
- Brain context includes tenant-owned active product/objective catalogue records, plus human-reviewed, **not independently verified** scientific trend evidence.
- Fixed-destination Europe PMC research discovery; curated sector and query validation; quarantined metadata and citation links; bounded results/response length.
- Opt-in OpenAI Responses model adapter. Requests disable model tools, streaming persistence, and external actions; all 13 domain agents can request **draft-only** model text through existing tenant budget reservations. Disabled by default.
- Skill evaluation uses a fixed, code-reviewed policy corpus and managerial approval. Approved-for-code-release proposals **never** mutate active runtime capabilities on their own.
- Added regression tests for model adapter, agent reasoning integration, catalogue authority, internal event consumers, handoffs, evidence, and safety gates.
- Recovered a historical baseline SQL migration; CI now applies the complete migration chain through `prisma migrate deploy` and checks the live database against the Prisma datamodel using `prisma migrate diff --exit-code`. Reconciled performance indexes and made the workflow-step FK restrictive.

## How to activate in controlled staging (not production authorization)
1. Deploy a disposable tenant-scoped PostgreSQL staging database with `prisma migrate deploy`. The clean-database CI path is verified; for any existing pre-migration deployment, take a database backup and reconcile the migration history against the existing objects first.
2. Provision production-grade OIDC tenant identity and only approved roles. Entra provider setup remains deferred by user direction; staging may use permitted test identity only.
3. Start API + web; verify OIDC, role permissions and two-tenant isolation. For the internal Brain worker explicitly opt in `MARKETING_BRAIN_WORKER_ENABLED=true`.
4. Keep `MARKETING_AI_REASONING_ENABLED` false until the user has approved model egress, confidential-data handling, and spending.
5. To test model-assisted drafts, explicitly configure `MARKETING_MODEL_PROVIDER=openai`, `OPENAI_API_KEY`, `MARKETING_OPENAI_MODEL`, `MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION`, `MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION`, `MARKETING_MODEL_RESERVATION_MICROS`, and `MARKETING_AI_REASONING_ENABLED=true`, and create a tenant `ModelBudget` record. **Do not commit secrets.** Provider prices are externally reviewed configuration, not invented defaults.
6. Test an idempotent Brain run, its 13 agent decisions and final `REVIEW_REQUIRED`; inspect outbox, inbox, audit and model budgets; verify no publishing, CRM messaging or ad purchase.
7. Force-stop a worker after model completion but before checkpoint, verify no automatic replay, and perform operator reconciliation.
8. Discover a Europe PMC query, inspect quarantined signals; review evidence, inspect a trend brief and propose a skill; verify that neither research metadata nor approved skill proposals bypass scientific/brand approvals.

## CRITICAL: What CI does **not** certify
1. **Existing-database upgrade readiness:** CI now validates a clean PostgreSQL `prisma migrate deploy` plus schema drift check. It does **not** demonstrate migration of any previously deployed database that was initialized through `db push` or has divergent tables. Existing installations require a reviewed baseline-stamping/backfill procedure and dry-run on a backup before deployment; never run baseline creation against live existing tables blindly.
2. **True external model billing:** Responses usage exposes token counts; configured token prices yield a **computed estimate**, not independently verified provider invoicing. Current `ModelResult.actualCostMicros` / ledger settlement treat this estimate as the charge. Finance-grade accounting requires explicit estimated-versus-billed separation and reconciliation.
3. **Scientific verification:** Europe PMC metadata and operator review are not independent verification, product regulatory clearance, clinical suitability or commercial rights.
4. **True autonomy:** The 13 agent engines produce distinct guided work packages and optional model drafts. They do not autonomously negotiate with vendors, publish, run paid campaigns, validate all scientific claims, or obtain external approvals.
5. **Live deployment:** No verified deployment, OpenAI provider credentials, live model usage, background job soak test, licence review, current marketing data feed, or production user acceptance evidence in this repository.
6. **Full durable worker guarantees:** CAS plus no automatic recovery is conservative. Distributed lease fencing, model/broker charge reconciliation and process crash-injection tests are necessary before large-scale autonomous operations.
7. **Marketing effectiveness:** No real channel analytics, attribution baseline, CRM performance feedback, ad-platform integrations or supervised on-brand content quality benchmarks.

## Next delivery priority — Phase 3 integration, after closing release blockers
**P0 Release blockers:** reconcile/verify migration upgrades on existing databases (clean deployment is CI verified); correct estimated-vs-billed cost accounting; end-to-end multi-tenant CI and crash/failure injection; observability/alerting for FAILED and NEEDS_INTERVENTION.

**P1 Domain intelligence:** authoritatively sourced brand master, portfolio specifications, analytics/attribution, sector-specific scientific evidence checks, scored human-review quality evaluations, continuous governed literature watchlists.

**P1 Integrations & UX:** human approval console, agent run graph/incident controls, asset review, compliant social/calendar channel adapters and marketing analytics/CRM connectors. Preserve explicit authorization for publishing, spending, consent-dependent messaging and customer data exports.

**P2 Production:** non-repudiable release approvals, model/provider privacy approvals, cost reconciliation, staging live data acceptance, secure provider keys, rollback, performance and operator training.

## Acceptance status
- **Phase 1 internal demo workflow:** implemented and CI tested, including clean schema migration; long-running distributed failure recovery, staging and production acceptance outstanding.
- **Phase 2 governed domain drafting / learning foundation:** implemented and CI tested; genuine source-verified autonomous intelligence and business-integrated learning outstanding.
- **Production launch:** NOT APPROVED.
