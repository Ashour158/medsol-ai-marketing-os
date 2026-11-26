# T1 — Durable internal conversion form and synthetic submission (WF32/WF33)

## Canonical owners
Campaign/Brand and ApprovalService retain authority. MarketingConversionForm is the immutable internal form revision; approval is the existing Approval row, not a second approval state. MarketingSyntheticContact and MarketingSyntheticConsent remain the sole synthetic contact and suppression authority. MarketingConversionSubmission is the sole synthetic form/CRM-outcome evidence ledger, not a contact master or CRM. All records FORCE RLS, same-tenant FKs and scope triggers.

## Implemented
- Manager proposes exact headline/CTA revision on an independently approved active same-brand campaign, pinning campaign version and SHA-256 scope. Immutable fixture key replays exact content only. Existing ApprovalService independently approves exact current revision; no new approval engine.
- Authenticated internal submission references an existing same-brand synthetic contact, explicit mock CRM purpose, exact form digest, current synthetic opt-in and no permanent complaint/hard-bounce suppression. No real opt-in is inferred from this test ledger.
- Unique tenant fixture key and form/contact deduplication, immutable synthetic ACCEPTED/REJECTED/OUTCOME_UNKNOWN disposition; same key returns history, changed payload conflicts, new key cannot duplicate the same form/contact. No automatic retry or remote CRM write.
- Existing audit ledger records provenance; no personal data fields accepted, no provider account or public submission route. UI exposes internal draft/approval reference, synthetic contact and mock outcome. Real PostgreSQL test covers exact review, invalid scope, consent withdrawal, duplicates, ambiguity, foreign tenant and unprivileged RLS.
- This is a simulated authenticated form workflow. It does not certify a real landing page, true lead scoring or capture, legal consent, CRM authority, delivery receipts or attribution. Public hosting, verified first-party purpose/consent, actual CRM integration, exports and independent acceptance remain pending. NOT_CERTIFIED.
