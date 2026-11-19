# R2H — Synthetic Audience, Consent & Email Journey execution

**Implemented scope: a durable, no-account, no-email, no-ESP simulation vertical slice.** The simulator is NOT a production contact list, legal consent ledger or actual email delivery service. Never mix these events with live customer permission data.

## Mandatory single-owner Reuse Map

| Concept | Authoritative owner and reuse | New bounded scope |
| --- | --- | --- |
| Tenant, brand, permissions | Organization/Brand + existing OIDC User, marketing-permissions, Next.js BFF | OIDC matching active ADMIN/SUPER_ADMIN; no second IAM or tenant master |
| Campaign and human release | Existing CampaignService/ApprovalService/Campaign | An actual same-brand **APPROVED** campaign is required; no new campaign or approval owner |
| Marketing audience & consent | **New bounded owner**, MarketingSyntheticContact and append-only MarketingSyntheticConsent | Synthetic-only IDs and ordered mock opt-in/withdrawal/complaint with real tenant RLS; never legally verified consent |
| Email journey intent and audience | **New bounded owner**, MarketingEmailSimulation | Immutable, content-digest-bound audience eligibility snapshot and suppression tally; status only SIMULATED/BLOCKED |
| Reliable events/audit | Existing AuditEvent and OutboxEvent | Reuse same transaction and internal no-send event; no shadow queue |
| Analytics | Existing MarketingPerformanceService | No actual send, open, clicks, bounces, delivery, revenue or attribution claims; results are diagnostics only |
| Connector hub | Existing PlatformIntegrationHubService | **Not touched**; no SMTP/ESP account, token, domain-auth or outbound email API |
| User interfaces | Existing Command Center and authenticated Next BFF | Synthetic Consent & Email Studio for administrators only |

## Functional no-account scenario

1. Authorized tenant ADMIN selects existing active Brand and independently human-approved Campaign.
2. Create anonymous synthetic contact identifiers (server-generated UUID plus domain-separated internal SHA-256 reference; no input field for email, name, phone or personal data).
3. Append simulated consent events, with deterministic per-contact `sequence`: `SIMULATED_OPT_IN`, `SIMULATED_WITHDRAWAL`, `SIMULATED_COMPLAINT`. A simulated complaint is permanent suppression and cannot be superseded by a later opt-in. The event ledger is immutable and idempotent by tenant/contact/evidence reference.
4. Select up to 100 unique tenant+brand synthetic recipients, submit exact approved campaign, `contentDigest` and an idempotent requestKey.
5. Snapshot `[contactId, latestConsentEventId, sequence, eligibility]` for every contact, apply complaint overrides, produce SHA-256 tenant/campaign/brand-scoped audience digest.
6. In one serializable transaction, persist the simulated email journey, audit source digest, and an internal Outbox event. A matching key and unchanged content/audience replays the previous simulation; a changed audience, withdrawn consent or creative digest conflicts and cannot quietly overwrite approval.
7. The status is SIMULATED when any synthetic eligible contact exists, else BLOCKED. The only outputs are counts of eligible, withdrawn, complaint-suppressed, missing consent; actualMessagesSent and verifiedProviderReceipts are ALWAYS zero.
8. No recipient address, HTML send body, unsubscribe token, ESP key, provider event or network send is held or created. This is a *negative acceptance and rehearsal engine*, not a compliant commercial marketing data service.

## Database and runtime controls

- Three new, narrow source-of-truth tables, all FORCE tenant RLS, restrictive select/insert only, append-only update/delete triggers.
- Contact references match strictly `internal:synthetic-recipient/[64 hex]`, events `internal:synthetic-consent/[64 hex]`.
- Consent actions restricted to the three simulated statuses, sequence positive and unique per contact.
- Email simulations restricted to SIMULATED/BLOCKED; SQL CHECK validates SHA-256 digests and result JSON with `actualMessagesSent=0`, `verifiedProviderReceipts=0`, `externalEffectsAuthorized=false`.
- Insert trigger checks approved campaign and exact matching tenant brand. Composite tenant FK prevents cross-tenant contact/brand/campaign assignment.
- A verified tenant OIDC ADMIN/SUPER_ADMIN and exact server-side role/subject/tenant matching is required for creation, consent and sending simulations.
- The existing BFF/permission registry allowlists only `/marketing/audience/synthetic-contacts`, `/:id/consent` and `/marketing/email/simulations`; no real email send, export or bulk-mail endpoint.
- Target register marks E29 Audience/Consent, E30 Email/Journey and WF16/WF17 **PARTIAL only**; actual ESP E31/WF18 stay NOT_IMPLEMENTED. Existing DAM, social and OAuth registers also updated from stale NOT_IMPLEMENTED to PARTIAL, never VERIFIED_IMPLEMENTED.

## End-to-end evidence

The new PostgreSQL full journey tests:
- Create authorized tenant and foreign tenant, Brand and approved Campaign through canonical CampaignService+ApprovalService.
- Deny unapproved campaign and any attempted PII/email input to synthetic contacts.
- Record consent opt-in, withdrawal, complaint and absent consent, assert eligibility = 1/4.
- Prove exactly one immutable synthetic simulation, one audit, one internal Outbox; safe same-key replay.
- Reject cross-tenant/brand, forged OIDC, viewer-role, duplicate contact, changed source digest and complaint re-opt-in.
- After withdrawal, old key cannot replay an outdated audience; a new simulation becomes BLOCKED, with zero sends.
- Prove SQL rejects forging SENT status, manipulating consent or inserting a fake delivered count, and tenant FORCE RLS hides foreign contact records.
- Full CI build, clean/historical Prisma migration, schema drift, API/web/tests and security/SBOM required before merge.

## Unfinished R2 customer acceptance and R3

Full R2 still requires compliant **real** marketing contact, preference and opt-in provenance master, lawful import/export and region controls, per-sender brand domain auth (SPF/DKIM/DMARC), template/journey versioning, suppression immediately before actual send, ESP adapter contracts and signed feedback, bounces/complaints/unsubscribe, quiet hours, consent expiry and legal review. R2 also needs full creative brief-to-editable image/video tools, extensive product and fact QA, official-social provider contract simulator, and proven source analytics.

R3 still requires signed deep agent manifests and brain skills, actual multi-provider model routing, governed MCP/A2A registry, evaluated knowledge/RAG fabric, and canonical approved Workflow/Blueprint DAG execution beyond virtual-only simulation.

**Do not connect real provider or actual recipient account until the functional software has passed simulator E2E and security gates. Even after that, real-provider interoperability must be independently staged before any production release.**
