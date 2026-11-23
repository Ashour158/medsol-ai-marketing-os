# T8B — Customer intelligence and conversion exports (offline only)

## Reuse Map
- **Market intelligence:** `MarketingLearningService.trendBrief` remains the one reviewed LearningSignal authority; existing `MarketIntelligenceStudio` filters are used as-is. T8B serializes only filtered, source-reviewed topic diagnostics and citations, without scraping or a second research engine.
- **Conversion/commercial:** `MarketingPerformanceService.summary` remains the one reviewed KPI authority and `modelOfflineRevenueScenarios` remains the one hypothetical arithmetic implementation. T8B recomputes the exact scenario result against the captured assumptions before exporting, with no independent forecast or ROI authority.
- **Exports:** one reusable CSV escaping and fail-closed validation helper; no new tables, workflow engines, tenant IAM, provider adapters or finance posting.
- **Release:** T6B remains sole release authority. These files are unsigned operator artifacts and never represent certified revenue, market share, actual sends or provider access.

## Delivered
- Market Intelligence Lab: export only currently filtered reviewed topic diagnostics, citation links, research triage priority, host diversity and freshness. CSV explicitly says not independently verified and no market-share conclusion. Source URLs must be HTTPS or are marked UNVERIFIED_SOURCE. Tenant binding checked.
- Conversion/Revenue scenario workbench: export input assumptions and downside/base/upside scenarios in exact units. The canonical arithmetic is re-executed and compared to the displayed result before download; stale/modified assumptions cannot be exported as if reviewed. Revenue and contribution are labelled hypothetical, not booked.
- CSV formula injection prevention, size bounds and static test coverage for forged source, cross-tenant selection, tampered scenario and false verification.
- No external provider accounts, publishing, email delivery, CRM write, financial posting or production certification.

## Outstanding
Live market source acquisition, true CRM lead handoff, attribution/causality, finance reconciliation, consent master, independent 500-case QA and persistent staging are still required. E01–E36 and WF01–WF41 are target inventory, not automatically completed by a new export.
