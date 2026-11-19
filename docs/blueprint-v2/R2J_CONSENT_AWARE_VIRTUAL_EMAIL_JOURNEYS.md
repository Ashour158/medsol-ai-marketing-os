# R2-J — consent-aware virtual email journeys, DST and frequency caps

## Mandatory Reuse Map
| Business concept | Canonical owner | Extension |
|---|---|---|
| Contact/consent/suppression | Existing R2H `SyntheticAudienceEmailService`, `MarketingSyntheticContact` and append-only `MarketingSyntheticConsent` | No new consent ledger, no personal addresses, no false opt-in |
| Email intent and immutable audience snapshot | Existing `MarketingEmailSimulation` | Journey definition digest and bounded virtual step plan in existing immutable result JSON |
| Provider transport | Existing `simulateSyntheticEmailTransport` | Per-step 12-scenario simulation, no ESP SDK, no sends or receipts |
| Campaign approval | Existing `CampaignService` and `ApprovalService` | Same-brand approved campaign still required |
| IAM / RLS | Existing OIDC User and MANAGE_TENANT, FORCE RLS | Same active-identity check, same transaction |
| Audit / events | Existing AuditEvent and OutboxEvent | Original email simulation audit/outbox reused |

## Delivered
- Strict journey DSL: 1–8 unique steps, IANA time zone, explicit UTC start, 0–10080 minute delays, 90-day total horizon, daily cap 1–3 and rolling 7-day cap 1–10.
- Deterministic virtual scheduling with overnight quiet hours and daylight-saving-time-aware local calendar boundaries, hard 14-day per-step search bound, no silent cap bypass.
- Each step carries a distinct domain-separated virtual provider reference and one of the 12 synthetic ESP scenarios. Ambiguous outcomes never grant automatic retry.
- The journey digest is bound to the existing audience snapshot, content digest and idempotency key; replay with a changed definition is rejected.
- Result always states `requiresFreshConsentAtExecution:true`. Current synthetic consent is **not legal opt-in**, and future eligibility cannot be guaranteed by an immutable historical snapshot.
- Existing immutable PostgreSQL result has additional SQL no-send/no-receipt/no-retry checks. CI includes pure DST, caps, ambiguous scenario and invalid DSL tests, plus actual PostgreSQL replay/approval/tenant and no-send checks.

## Non-completion
R2 still needs **real** consent provenance, compliant suppression and unsubscribe enforcement, sender identity/DKIM/SPF/DMARC, verified ESP delivery and signed feedback, eligible social accounts and real publish receipts, editable creative/source production and full customer acceptance. These require later staging evidence and provider/legal review; this offline journey is **not** an email sender or a finished R2 release.
