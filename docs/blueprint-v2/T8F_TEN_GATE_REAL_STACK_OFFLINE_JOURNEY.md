# T8F — All ten real-stack offline campaign stages in disposable PostgreSQL CI

## Reuse Map
This adds **no new application source of truth**. Only strengthens the existing `postgres-r3o-full-offline-campaign-journey.integration.test.ts` real-PostgreSQL E2E scenario by exercising `MarketingPerformanceService.ingest`, `review`, and `summary` in the same canonical workflow as existing campaign, brain, exact human approvals, immutable DAM PNG/readback, sandbox publication, synthetic email and quarantined learning. Existing `MarketingReadService.offlineJourney` and `buildCustomerDeliveryDossier` remain the sole timeline / six-pillar evidence owners.

## Evidence exercised in one isolated campaign
1. Brief and authoritative workflow: created by original Campaign/Workflow services.
2. Thirteen-agent brain: real ledger with zero external inference.
3. Human campaign maker-checker: separate creator/reviewer identities.
4. Current creative: actual generated PNG persisted in the disposable test PostgreSQL, with immutable preview and SHA-256 readback.
5. Rights: independently reviewed by a separate human fixture identity.
6. Exact creative approval: original author denied; independent reviewer accepted.
7. Social: one successful internal-only publication simulation; zero provider posts.
8. Email: one synthetic opt-in and simulated email; zero actual messages.
9. Performance: **new** four synthetic CI-only count observations (1,000 impressions, 200 clicks, 20 leads, 5 qualified). Each enters quarantine; creator cannot self-review; separate reviewer reviews fixture provenance; derived ratios remain descriptive and ROI/attribution **unverified**. This is NOT actual customer campaign traffic, CRM leads or factual revenue.
10. Learning: synthetic campaign control signal remains quarantined.

After these steps the canonical read-only timeline should expose **10/10 offline gates**. The customer dossier remains explicitly UNSIGNED / OFFLINE_EVIDENCE_ONLY / NOT_CERTIFIED / no real provider effects. The 500 independently signed enterprise cases are still **not executed**.

## Safety
- Test runs only under `MARKETING_DB_INTEGRATION=1` with a newly generated disposable organization and no real provider credentials.
- Observations are named `internal:r3o-disposable-synthetic-funnel-not-real` and are not imported to any customer tenant.
- **Independent fixture actor review** means maker/checker code paths were exercised in CI, NOT that an independent external QA organization has certified the product or the numbers represent real market performance.
- Release checker T6B and external persistent staging requirements are unchanged.

## Blueprint
This closes an **end-to-end simulated engineering acceptance path** across the six customer pillars. It does NOT complete the full 36-engine/41-workflow target inventory (for example, customer onboarding, official provider connection, actual editable design integrations, real landing pages/CRM handoff, live ESP delivery, financial revenue reconciliation and background intelligence monitoring). Do not promote those target states without separate executable and independent acceptance evidence.
