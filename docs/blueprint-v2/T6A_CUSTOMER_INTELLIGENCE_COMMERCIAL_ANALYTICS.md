# T6A — Customer-facing Market Intelligence and Commercial KPI Engine Integration

**Scope:** Real, human-governed offline source-to-decision functionality; it extends original domain services. **Not** full R2–R4, live provider acceptance or independent customer UAT.

## Mandatory Reuse Map

| Concern | Single authoritative owner | Implemented extension |
|---|---|---|
| Research and market signals | `MarketingLearningService` / `LearningSignal`, reviewed `KnowledgeDocument` | Source-host diversity and staleness diagnostics; market intelligence UI reads existing `GET /marketing/learning/trends` |
| Campaign performance evidence | `MarketingPerformanceService`, existing `MarketingMetricObservation` | One exact BigInt calculation helper with inconsistency alerts, no new metric table |
| Conversion hypotheses | `OfflineRevenueScenarioStudio`, existing reviewed qualified-lead totals | Existing scenario workbench unchanged; provenance remains human-reviewed, never measured revenue |
| Campaign creative, social, email | `CreativeAssetService`, `CampaignPublicationService`, `SyntheticAudienceEmailService` | Existing isolated customer flows remain intact; no bypass of rights/consent/approval |
| Provider connections | `PlatformIntegrationHubService`, `IntegrationOAuthLifecycleService`, `ProviderContractTrialService` | Existing governed offline provider trials unchanged; no new SDK credentials |
| IAM, tenant, review | Existing OIDC/session, Nest permissions, Next BFF, FORCE RLS | Existing `READ_AUDIT` trend route; no new external calls or independent model inference |

## Functionality

1. `MarketIntelligenceStudio` is mounted into the existing customer-facing Command Center, with a distinct workspace nav entry. It reads the canonical reviewed learning signal registry, reports last-observed age, 90-day signals, distinct valid HTTPS hosts, and citation titles/URLs. It filters by sector/topic. A topic requires at least three recent observations from at least two distinct source hosts to receive **research-priority**, never an investment/truth/projection decision.
2. `reviewedMarketSignals` is bounded by the existing 200-row source read, makes no additional HTTP requests and refuses to count non-HTTPS/invalid source origin as a corroborating host. Expired or revoked linked KnowledgeDocument records are excluded upstream.
3. `MarketingPerformanceService.summary` now delegates all descriptive ratio arithmetic to one `summarizeReviewedCommercialMetrics` helper. Missing denominators and contradictory cross-source funnels return **null** instead of percentage greater than 100. Added reviewed lead-qualification rate, cost per qualified lead, exact BigInt arithmetic, and explicit warnings for pending quarantined records, unaligned cohorts and unverified spend currency.
4. The existing `PerformanceConsole` exposes these diagnostics next to approved-source totals and the existing hypothetical revenue scenario workbench. **Neither is true multi-touch attribution, financial ledger revenue, customer ROI, price verification or CRM conversion writeback.**

## Acceptance and limitations

- New pure tests cover source diversity, staleness, missing hosts, exact arithmetic beyond JS safe integers, inconsistent stages, null denominators and source-warning flags. Existing PostgreSQL performance, RLS and marketing-trend suites continue in the full CI baseline.
- Real Meta/LinkedIn/ESP/Canva/Adobe/AI provider credentials are absent. Existing provider protocol simulations are not official entitlement or delivery proof.
- Real creative editor integration, external social publishing, real ESP contact imports/verified opt-in, destination-scoped OAuth and receipts, independent market survey, conversion-event provenance, CRM/finance reconciliation and tenant UAT remain **uncompleted commercial-release gates**.
- This scope does not certify deployed persistent staging, external provider compatibility, 500-case independent QA or production readiness.

**Verdict: T6A engineering candidate, pending commit-specific CI. Overall `NOT_CERTIFIED`.**
