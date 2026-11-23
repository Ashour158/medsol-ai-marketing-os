# T8E — Offline creative output, mock conversion funnel, reviewed-intelligence attention queue

## Reuse Map (no shadow service or table)
- **Creative**: Existing CreativeAssetService, immutable CreativeAssetRevision, VerifiedMediaEvidenceService and offlinePreview API remain the only authoritative data/rights/digest owners. UI exports a previously verified *current* flattened PNG and its separately editable text. No new DAM owner, version record or fake layered design format.
- **Conversion and revenue**: Extend the existing pure, local `offline-revenue-scenarios.ts` model for **anonymous fixtures only**, plus the same `offline-evidence-csv.ts` export authority. Actual conversion observations, CRM reconciliation and marketing KPIs continue to be owned by MarketingPerformanceService. No form submission endpoint, contact table, lead record or CRM write added.
- **Intelligence**: Existing `MarketingLearningService.trendBrief` reviewed signals remain the only source. The original MarketIntelligenceStudio now filters stale, research-priority and single/unknown-source topics in a read-only review queue; uses its existing source-bound CSV export.
- **Workspace**: Existing PerformanceConsole inside OperationsConsole now hosts anonymous conversion simulation and receives a stable anchor for readiness navigation. No separate billing, analytics or consent authority.

## Functionality
1. Creative studio: download an actual server-readback, immutable, current flattened PNG, or its editable text copy (.txt) with strict revision/digest/boundary validation. Refuses stale, mismatched, wrong MIME/URL, out-of-bound and unsupported source type. **Not a layered editable design file.**
2. Mock landing page/form conversion UI: edit CTA headline/copy, enter bounded *virtual* visits, clicks, form submissions, qualified counts; fail closed on inconsistent funnel math or malformed values. Simulate denial, duplicate attempt, suspected bot or throttling. No real visits, contacts, legal consent, submissions or CRM handoffs.
3. Exact BigInt ratio calculations with defined zero-denominator state; unsigned CSV recomputes original source input and rejects forged customer results, production status or CRM outcomes.
4. Reviewed-intelligence attention filters and source-diversity warnings improve market research triage; no scheduled crawling, no independent market verification or company-tracking claims.
5. Negative tests verify zero-real-world claims, source matching, blocked scenarios, export integrity and current creative version checks.

## Customer acceptance still pending
- True editable layered design integration / creator handoff; social/community/live provider eligibility; real email opt-in/ESP; persistent market watchlists and lawful source ingestion; actual landing page/form hosting; consented CRM integration; verified currency/ROI and attribution.
- Independent persistent staging, 500-case signed QA, security and recovery acceptance, provider UAT: **NOT_CERTIFIED**.
- These are deliberate free/offline capabilities that can run on existing GitHub CI without real provider accounts.
