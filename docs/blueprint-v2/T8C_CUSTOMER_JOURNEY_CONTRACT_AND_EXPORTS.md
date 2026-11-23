# T8C — Canonical ten-stage customer journey, six separate exports

## Reuse Map
- `MarketingReadService.offlineJourney` remains sole **source of the ten stage values**. New `@medsol/contracts` stage manifest only enumerates their shared keys and the existing T4C UI labels/navigation; it does NOT compute readiness or own any business state.
- `campaign-readiness.ts` now reuses the shared manifest; no duplicated stage source.
- `buildCustomerDeliveryDossier` remains the only server-side sanitized six-pillar projection. Its key set must match the ten canonical fields; unknown substitutions and missing fields fail closed instead of claiming a completed simulation.
- The existing `CustomerDeliveryDossierStudio` and its trusted same-tenant audited BFF response remain the only export source. `dossierPillarCsv` reuses the same sanitized rows as the combined dossier report; no CRM contacts, email addresses, publication credentials, approval actors, and no raw provider receipts are serialized.
- Existing signed OIDC policy, PostgreSQL tenant RLS, human approvals, CreativeAsset, CampaignPublication, SyntheticAudienceEmail, MarketingLearning and MarketingPerformance remain unchanged.

## Operator improvements
1. **Each of six** customer-facing pillars has a dedicated unsigned CSV with scoped campaign ID, observation timestamp, evidence qualification and explicit NOT_CERTIFIED, next to the existing full CSV and JSON.
2. Missing offline gates are now labeled actions linking directly to existing studio anchors (creative, social, email, reviewed performance, approvals, knowledge or journey), rather than unreadable camelCase keys.
3. Both client export and server read-only dossier require the **exact** canonical ten stage keys. Client additionally enforces missing-stage consistency and fail-closed flags for legal email consent, CRM outcomes, attribution, revenue, market claims and source currency verification.
4. Vitest negative corpus rejects changed stage IDs, manipulated missing-stage list and falsified live/commercial claims.
5. Existing real PostgreSQL full-journey integration verifies the same stage ordering and missing reviewed-performance gate. Existing R3Y signed OIDC real-stack Chromium scenario now checks all six browser downloads and the recovery navigation link.

## Honest remaining gaps
The dossier exports are *inspection and rehearsal exports*, not creative/media exports, social post receipts, ESP deliverability records, CRM outcome attribution or verified financial statements. This tranche does not replace design tools, real provider account qualification, independent 500 QA or persistent staging. **NOT_CERTIFIED.**

## Acceptance evidence
Only merge after full GitHub Actions verification, dependency security inspection, PostgreSQL integration and actual browser pass. The CI evidence proves the implementation's simulated behavior; does not by itself certify enterprise production.
