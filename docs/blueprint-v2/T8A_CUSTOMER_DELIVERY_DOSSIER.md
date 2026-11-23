# T8A — Six-pillar customer-facing delivery dossier

**Status:** Engineering implementation, subject to CI and real-stack acceptance. **NOT_CERTIFIED**; this is not closure of all E01–E36 or WF01–WF41.

## Reuse Map
| Pillar | Canonical owner reused | What T8A adds |
| --- | --- | --- |
| Creative | CreativeAssetService, CreativeAssetRevision and ApprovalService | Count only current, campaign-publication-linked, rights-reviewed and approved revisions; brand drafts never become campaign assets automatically |
| Social | CampaignPublicationService | Display sandbox-only publication intent/attempt counts; zero real posts |
| Email | SyntheticAudienceEmailService | Display synthetic simulation count; zero messages and no export of contacts or consent references |
| Intelligence | MarketingLearningService.trendBrief | Clearly tenant-wide reviewed market signals; no campaign attribution or market verification |
| Conversion | MarketingPerformanceService.summary | Reviewed leads and qualified-lead counts, explicitly not CRM-confirmed outcomes |
| Commercial | MarketingPerformanceService.summary | Source-reviewed KPIs, quarantined counts, reconciliation warnings, never verified ROI |
| Cross-engine timeline | MarketingReadService.offlineJourney | Exactly ten offline gates, bounded read-only projection, no duplicate tables or workflow owners |
| Identity/transport | BootstrapAuthGuard, marketing-permissions, Next authenticated BFF | Existing signed OIDC session + READ_AUDIT; viewer forbidden; no new auth |
| QA | Existing R3Y real-stack Playwright + Vitest | Adds same-case real browser/tenant assertions, forged evidence and CSV formula injection tests |

The read-only `GET /marketing/journeys/:id/dossier` runs three authoritative tenant-scoped reads, binds them to the same campaign, refuses any source asserting production, attribution or provider effects, and returns **only a bounded sanitized summary**. It contains no recipient address, contact ID, raw approval actor, creative source bytes, provider token or customer CRM data. An audited operator can export an unsigned JSON or CSV report from the same sanitized response.

## Acceptance and limitations
- Verified campaign ID, signed tenant and READ_AUDIT role required. Cross-tenant campaign access must return no dossier. Viewer role denied.
- Source errors fail the report rather than presenting a synthetic pass. The UI resets on identity/campaign changes and exposes errors and retry.
- Six customer pillars have visible status, counts, warnings, offline gate blockers and JSON/CSV exports. CSV neutralizes spreadsheet formula prefixes.
- No side effects: no provider sends, social posts, CRM writes, independent QA signoffs, media generation, legal consent, revenue recognition or paid spend.
- The 500-case independent QA program remains unexecuted; the app is not deployed to persistent staging and remains NOT_CERTIFIED.

## Blueprint E01–E36 / WF01–WF41 gap disposition

The v2.1 target register is an **inventory, not a completion certificate**. T8A improves six customer workspaces and evidence visibility, but does not promote a target engine or workflow to VERIFIED_IMPLEMENTED merely because it appears in a report.

Remaining provider/access-dependent or incomplete customer outcomes include:
- E01–E13: comprehensive customer onboarding/business discovery, audience segments, authoritative calendar/scheduler, editable external creative, localization and production content QA
- E15–E19: real platform publishing, eligible OAuth accounts, community inbox, listening and crisis routing
- E20–E22: reconciled connector metrics, CRM-to-revenue attribution and controlled experiment execution
- E29–E33: lawful contact master and ESP deliverability, multiformat brief/design coordination, governed web acquisition
- E34–E36 and WF37–WF41: full search/AEO, voice-of-customer, corporate communications, partner enablement and customer success flows
- Other engine/workflow gaps remain governed by the existing v2.1 register; they must each have a real authoritative implementation, policy tests and external acceptance before state promotion.

**Next implementation priorities:** editable creative source and localization contracts; offline social/community case lifecycle; synthetic email deliverability and suppression rehearsal; lawful first-party conversion/CRM mock handoff; operator-controlled market watchlist; source-cohort reconciliation and export enhancements. These should extend the existing owners, not spawn shadow systems.
