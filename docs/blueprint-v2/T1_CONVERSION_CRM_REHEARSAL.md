# Tranche 1 — Anonymous conversion-to-CRM handoff rehearsal

## Reuse Map
- Existing `offline-revenue-scenarios.ts` owns pure anonymous conversion fixture arithmetic, not CRM data. Extend that model instead of adding a parallel CRM.
- Existing `SyntheticConversionLab` hosts the preflight UI and invalidates stale results when source counts or gate inputs change.
- Existing `offline-evidence-csv.ts` owns unsigned CSV exports, with recomputation to reject modified evidence.
- `MarketingPerformanceService` remains authoritative for reviewed real conversion observations. No new database, lead table, consent ledger, contact ID, brand binding, provider transport or financial attribution.

## Delivered
- Anonymous virtual consent and withdrawal, duplicate claim handling, blocked form fixture, empty qualified set, accepted/rejected/ambiguous simulated transport.
- Refuses malformed idempotency keys, never exposes keys in exports, and never automatically retries ambiguous outcomes.
- Customer-facing rehearsal and redacted CSV. Tests assert no created leads, no executed handoff, no verified consent, no external effects, no disguised certification.
- This code is intentionally safe without real provider accounts and is NOT an actual CRM workflow or production form.

## Acceptance status
This is an offline engineering milestone, not closure of all Tranche 1 capabilities. Still required: first-party hosted form and legal consent authority, identity and tenant-bound contact dedupe, review/approval and reliable outbox, provider-specific CRM mapping, authenticated API receipts, safe ambiguous outcome reconciliation, two-tenant RLS and integrated browser acceptance. The six-pillar customer delivery gap register, 36-engine/41-workflow inventory, independent 500-case validation and release certification remain authoritative. **NOT_CERTIFIED**.
