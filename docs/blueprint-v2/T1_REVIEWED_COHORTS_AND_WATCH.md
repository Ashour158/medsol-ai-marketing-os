# Tranche 1 — Reviewed commercial cohorts, intelligence change watch, and clinical escalation

## Reuse Map
- MarketingPerformanceService / MarketingMetricObservation are the single reviewed metric authority. Existing summary adds exact-source record reconciliation from the same tenant-scoped consistent PostgreSQL snapshot; no other fact or attribution owner.
- MarketingLearningService / LearningSignal and the existing MarketIntelligenceStudio remain the sole reviewed signal source. Session-only operator watch compares two bounded snapshots, not a new durable watchlist or crawler.
- MKT-SOC-001 remains the sole social discussion classifier. Expand clinical cure/claim escalation and the original golden corpus; no autonomous replies.
- Reuse the existing Conversion Lab and signed real-stack acceptance suite to exercise the prior anonymous CRM handoff change. Existing CSV encoder handles reviewed watch exports.
- No new tables, migration, external credentials, provider contact, real send, CRM write, spend or new approval engine.

## Implemented
1. Complete reviewed source records match exactly on source system, record ID, reference and observed timestamp. Missing groups or impossible funnel counts are excluded. No joining differently timestamped or sourced metrics. Scan at most 1,001 rows; above 1,000 deny cohort output rather than reporting partial totals. Existing descriptive aggregate remains visibly unverified.
2. Existing performance console exposes matched counts and rates and allows original observation timestamp entry. Currency and monetary reconciliation remain explicitly unverified.
3. Market watch captures 1–20 filtered reviewed topics, refreshes the authoritative tenant registry, compares source-window count, freshness, coverage and priority, and exports recomputed formula-safe CSV. Changed/absent topics are not proof of market movement; cap is visible. No persistent state or background monitoring.
4. Social triage now escalates cure and clinical claim language to scientific and brand review. The original test phrase that previously missed scientific escalation is restored in actual browser acceptance.
5. Negative and positive tests exercise exact cohort matching, inconsistent groups, source identity separation, bounded reads, tenant isolation, watch snapshot forgery, formula-safe export, scientific escalation and the existing CRM mock handoff UI.

## Release disposition
This increment closes a limited offline analytics and evidence monitoring gap and hardens social classification. Do not classify entire Tranche 1 as complete: durable permitted source acquisition/watchlist scheduling, actual layered creative integration, customer community case lifecycle, real consent/deliverability and hosted conversion/CRM protocols, reconciled monetary/revenue attribution and remaining 36/41 target capabilities still require engineering and acceptance. Provider accounts remain disconnected as requested. Independent 500-case acceptance, persistent staging and production security remain NOT_CERTIFIED.
