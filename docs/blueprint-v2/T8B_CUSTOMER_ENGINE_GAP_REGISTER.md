# T8B — Customer-facing engine inventory closure control

## Reuse Map
- Reuse **the canonical** `packages/contracts/src/blueprint-v2.ts` target-state registry, `GET /marketing/architecture/blueprint`, and existing Command Center inspector. No parallel 36/41 inventory or new engine authority.
- Reuse **T8A** six-engine customer dossier for actual tenant-scoped creative/social/email/intelligence/conversion/commercial evidence and JSON/CSV export.
- Reuse the **existing** creative, social, email, learning, performance, campaign, approval and workflow domain services; do not add shadow state.
- Reuse existing T7A unsigned 500-case packets and T6B production release certification; neither is satisfied by this gap export.

## Delivered
The existing Blueprint inspector now exposes an **unsigned 77-row engine/workflow gap register** with registry state counts and an export of canonical IDs, owner, release, recorded blocker and target goal. The export rejects missing/reordered/duplicate IDs, forged state values and non-v2.1 registries. CSV spreadsheet-formula injection is neutralized. Regression tests cover integrity, spoofed states and export safety.

## Critical classification
The blueprint register's state and blocker descriptions can lag behind newer T6/T8 implementation work. These are **planning classifications, not a fresh independent code audit**. A `PARTIAL` or `VERIFIED_IMPLEMENTED` entry is not evidence of production entitlement, live delivery or independent QA. Do not bulk-mark all 36 engines / 41 workflows complete merely because they have names or UI panels.

## Six customer-facing owners and remaining acceptance
| Pillar | Canonical owner | Still required for full target-state |
|---|---|---|
| Creative | CreativeAsset / ApprovalService | Actual editable design source/render integration, rights verification, rendition lineage, version-bound review, customer asset previews and failure recovery |
| Social | CampaignPublication / Integration Hub | Provider capability/entitlement, real post/reconcile receipts, inbox/listening/community/crisis workflow, idempotent ambiguous outcomes |
| Email | Audience & Consent / Email Simulation | Real verified consent/suppression, deliverability/domain authentication, official ESP receipts, bounce/complaint/unsubscribe controls |
| Intelligence | MarketingLearningService | Governed lawful sources, competitive tracking/watchlists, independent source verification, citations/freshness and campaign linkage |
| Conversion | Campaign + reviewed metric/CRM authority | Forms/landing page, deduplicated qualified lead and consented CRM handoff, measured conversion provenance |
| Commercial | MarketingPerformanceService | Reconciled currency/cohorts, attributable revenue vs hypothetical scenario, ROI and verified finance/CRM outcomes |

## Offline end-to-end acceptance
The existing customer delivery dossier shows the ten-stage offline journey, cross-owner state, six pillars, pending gates and unsigned JSON/CSV. Real-stack GitHub CI tests are evidence of simulated engineering only. Independent 500-case QA, persistent staging, external pentest and real provider UAT remain pending. **NOT_CERTIFIED**.

## Next engineering sequence
1. Prioritize capabilities with missing executable owner or end-to-end customer UI; trace each to its exact E/WF ID.
2. Extend each existing canonical domain, with a negative-case test (cross-tenant, revocation, approval invalidation, unknown external effect), success test, and failure/retry/export proof.
3. Close real-stack simulated campaign journeys and refresh the registry **only when implementation and tests demonstrate the capability**. Provider-dependent gates remain blocked until user authorizes accounts.
