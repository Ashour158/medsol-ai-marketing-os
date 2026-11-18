# AGENTIC MARKETING & COMMUNICATIONS OPERATING SYSTEM
## Enterprise Master Blueprint v2.1 — Approved capability amendment and first implementation tranche

**Date:** 18 November 2026  
**Scope:** Complements the approved 1,377-line Master Blueprint v2.0. All v2.0 business, security, tenancy, interoperability, audit, consent, model-budget, maker-checker and authoritative-ownership rules remain mandatory. This amendment takes precedence only for the additions below.  
**Implementation truth:** The 36-engine and 41-workflow register is a **target-state architectural catalog**, not 36 running engines or a fully operational commercial SaaS. The first bounded, internal advisory algorithms were added in this tranche. No new external platform credentials, publication, messaging or commercial tenancy migrations have been activated.

## 1. Executive scope decision

Add exactly **three logical engines** E34–E36; deepen four existing engine/domain responsibilities; add **five workflow families** WF37–WF41; retain **10 cognitive brains, 13 canonical runtime agents, 12 UX personas and 13 studios**. Do not create an eleventh AI director, independent PR agent or parallel analytics system.

### Reuse Map — authoritative owners

| Capability | Authoritative existing owner | Consumer agents / cognitive brains | New code in this tranche |
| --- | --- | --- | --- |
| E34 search and AI discovery | MarketingLearningService (research evidence, via future permitted provider adapters) | MKT-STR-001, MKT-ANA-001; B03+B07 | \`reviewSearchDiscovery\` in existing agent runtime |
| E35 customer experience feedback | MarketingLearningService for aggregate hypotheses; Audience & Consent must authorize contact-purpose data; CRM/support remain external source facts | MKT-SOC-001, MKT-STR-001; B03+B06 | \`reviewVoiceOfCustomer\` |
| E36 PR and corporate communications | CampaignService for communications campaign; BrandMasterService for claims; existing ApprovalService for release | MKT-CONT-001, MKT-BRAND-001, MKT-SCI-001; B02+B06+B08 | \`reviewCorporateCommunication\` |
| E20/E21 revenue decision depth | MarketingPerformanceService (source observations and attribution) | MKT-ANA-001 + MKT-GROWTH-001; B07+B10 | \`reviewRevenueScenario\` |
| E14 authenticity / editability / rights | Future Creative & DAM aggregate with existing ApprovalService for exact review | MKT-CREATIVE-001 + MKT-BRAND-001; B05+B08 | \`reviewAssetAuthenticity\` |
| WF40 partner and sales enablement | MarketingProduct projection + CampaignService for collateral; external ERP/PIM and partner contracts retain authority | MKT-PM-001 + MKT-CONT-001; B04+B10 | \`reviewPartnerEnablement\` |
| WF41 onboarding and time-to-value | Tenancy & Commercial authority (future native aggregate), Identity & Governance for verified privileges | MKT-OPS-001 / Command Center; B01 | \`reviewCustomerActivation\` |
| R1 commercial action permissions | Existing \`packages/policy\` + authenticated server-side identity and future tenancy owners | All agents as advisory consumers; **human policy owner only** | \`authorizeCommercialScope\` preflight, not yet wired to external-effect adapters |

**No data ownership duplication:** marketing intelligence never becomes the owner of customer consent, survey identities, authoritative product pricing, legal approvals or publisher accounts. Research source references are data, not instructions.

## 2. E34 — Search & AI Discovery Intelligence

**Mission:** Make a customer discoverable and accurately represented in traditional organic search and permissioned AI answer experiences, without overstating population coverage.

**Inputs:** tenant/brand scope, approved domain and product catalog, controlled query/intent set, permitted source channel, geography/language/device where provider supplies it, capture timestamp, research right, source/collection ID, result or answer snapshot reference, AI mention or citation label, organic position (only for organic search), competing domain snapshot, knowledge and claim version. Every source includes capability/terms provenance and expiry.

**Brain and workflow:** B03 defines intent/query cohorts and eligible sources → E33 lawful collection or approved search/analytics APIs → E05 verified retrieval metadata → E34 normalizes observations → B07 assesses denominators, gaps and uncertainty → E06/E10 proposes on-site content/FAQ/structured-data improvements → E25 gets approval → authorized CMS/website owner applies changes, not the agent → E20 measures new source observations.

**Core logical sub-engines, implemented inside E34 (not separate services):**
1. Query portfolio: branded/non-branded, product use case, informational and commercial intent; weights from user-approved business goals.
2. Technical SEO audit: canonical URLs, crawl/indexability, accessibility, site structure, page quality, page speed signals and structured data. Only if authorized property data is connected.
3. Organic observation evaluator: date, query, geography, device, ranking, page and source; no invented rankings or universal averages.
4. AI answer observation evaluator: provider/model/version, prompt/query set, grounded mention/citation/position in answer **not** conflated with search ranking. Repeated sampling and response variability required for any trend.
5. Claim/brand accuracy monitor: compare captured claims to approved Brand Master and product source; human fact-check for disputed results.
6. Opportunity hypothesis generator: source-backed content gaps, legal/copyright-safe optimization proposals, experiment/holdout and realized impact.
7. Change-detection/review: compare equivalent samples, suppress provider/source drift, route significant changes for analysts.
8. Measurement: *sampled* brand mention rate, cited/uncited mentions, SERP coverage, share of reviewed queries, content adoption, measured organic conversions. Do not sell “AI ranking guarantees.”

**Delivery contract:** \`DiscoveryAssessment\` is an immutable review artifact with sampling frame, source IDs, coverage, uncertainty, brand/product refs, recommended changes, owner and limitations. No automatic CMS write, backlink spam, artificial traffic, deceptive cloaking, unauthorized provider scraping or commercial claims.

**First implemented logic:** \`reviewSearchDiscovery\` validates tenant and source IDs, collection permissions, bounded timestamps, reviewed samples and separate organic positions versus AI mentions; refuses position fields for AI answers; returns sample counts/rates only, never a publisher capability.

**Acceptance:** unknown/denied sources ignored or rejected; inconsistent sample sets flagged; multilingual observations not combined without explicit cohort; source-rights expiry blocks collection; no AI answer rank invented; evidence can be reconstructed.

## 3. E35 — Voice of Customer & Customer Experience Intelligence

**Mission:** Turn permissioned feedback into grounded product, marketing and customer-experience improvements, not covert personal profiling.

**Source hierarchy:** first-party feedback/surveys with purpose and notice, connected CRM/support where authorized, review platforms under terms/license, opt-in interview transcripts with privacy policy and retention. Call-source identities stay in authoritative Audience & Consent / CRM / Support services.

**Reasoning:** B03 designs feedback and sampling rubric → permitted sources provide minimized metadata → E35 maps themes and confidence/codes → B06 detects complaints, safety, privacy and reputation risks → B08 routes regulated or safety cases to qualified human reviewers → B07 tests patterns against cohorts, bias and historical sources → B04 proposes product/UX/content/campaign changes → E25 approval → source owner implements and measures changes.

**Subcapabilities:** issue/opportunity taxonomy; qualitative coding with expert-reviewed labels; sentiment with cultural/language and sarcasm uncertainty; JTBD and buying-objection clustering; churn-risk hypotheses (no sensitive inferred traits); text/voice feedback privacy redaction; complaint-to-resolution source linkage; journey friction mapping; cohort balance/bias, de-identified trend/impact, subject rights/retention and dispute/correction workflow.

**Privacy rules:** no customer email, contact IDs, raw medical records or unredacted complaint text in generic agent work packets. Suppress aggregate results for groups smaller than approved threshold; for v2.1 internal prototypes minimum cohort **5** applies to every released theme count, not just the total sample. A cohort of 5 is a technical lower bound, **not** sufficient GDPR/other privacy compliance. No consent inference from publicly visible profiles.

**First implemented logic:** \`reviewVoiceOfCustomer\` accepts structured, tenant-scoped, purpose-authorized, reviewed theme/source observations; excludes denied signals; rejects raw identity fields, duplicate evidence and cross-tenant data; suppresses small aggregate results. No CRM contact is created.

**Acceptance:** zero cross-tenant leakage, unlawful feedback reuse, small-cohort disclosure or autonomous complaint reply; measured reviewer precision/recall and bias on multilingual samples before production classification.

## 4. E36 — Corporate Communications, PR & Earned Media

**Mission:** Manage press, earned media, partnerships, investor/company narratives, executives and crises with defensible statements and human authority.

**Input:** governed communication brief, approved claims/evidence, campaign/brand, spokesperson authority, sensitive claims/territory, distribution audience and outlet permissions, press kit rights, legal/medical review and timing constraints.

**Logic/brain:** B02 enforces brand voice and factual claims → B03 provides market narrative/evidence → B05 drafts messaging, press kit and media formats → B06 monitors permitted public response/reputation → B08 checks regulated/financial/legal/privacy issues → E25 exact-version human approval → *future authorized PR distribution owner* prepares provider intent → provider receipt reconciliation → B07 reports earned coverage, share of voice and outcomes with source caveats.

**Subcapabilities:** corporate press release and Q&A, media contact provenance with permitted outreach, executive speeches, thought leadership, industry analyst relations, evidence-supported media lists, earned vs paid attribution, embargo and region checks, spokesperson/quote approvals, rapid response escalation, crisis tabletop exercises, corrections and takedown recommendations, editorial source rights and measuring accurate pickup.

**Approval matrix:** owner + brand approval minimum; regulated scientific claims require qualified scientific review; crisis/executive communications require legal/compliance; no model may make public commitments or impersonate media representatives. No unsolicited journalist scraping/email.

**First implemented logic:** \`reviewCorporateCommunication\` produces a bounded review packet and explicit reviewer roles, requiring reviewed evidence; always refuses release/public outreach. No new PR agent identity.

**Acceptance:** public release only through signed exact-version approval and approved channel; attributable spokesperson and quote rights; scheduled embargo respected; crisis false negatives tested with human exercises; remote media reactions stored as sourced observations.

## 5. Four deepened existing product capabilities

### 5.1 E20/E21 — Advanced Revenue Decision Intelligence
- Build source-reconciled funnel economics and KPI trees by tenant/brand/campaign/source and time; gross marketing cost vs incremental cost vs verified attributed revenue vs incremental *causal* outcomes are separate concepts.
- Compare scenario assumptions and ranges (low/base/high), margin contribution, effective CPC/CPL/qualified pipeline, capacity constraints and diminishing returns; show currency, tax and exchange-rate provenance.
- Marketing mix modeling, holdouts, attribution windows, conversion path and incremental lift require sufficient independently observed data and statistical design; never infer causality from correlations.
- Budget recommendation must include risk, uncertainty, spend cap, alternatives, owner and finance approval. No AI-controlled budget push.
- **Implemented now:** \`reviewRevenueScenario\` performs exact bounded integer micro-unit arithmetic for a *modeled assumption* and labels causal verification false. No live revenue attribution or autonomous budget allocation.

### 5.2 E09/E06/WF40 — Sales & Partner Enablement
- Support partner/distributor territory/country/brand delegation, approved product truth, evidence-backed use cases, compliant comparison sheets, objection playbooks, field kits, co-marketing assets, channel MDF proposal, distributor portal and market launch packages.
- Preserve ERP/PIM/CRM ownership of product facts, prices, account data, inventory, contract rights and channel statuses. Partners receive only explicitly authorized, expiring assets with edition/license and territory scope.
- Route claims/product versions through Brand Master/Scientific review and exact ApprovalService authorization. Avoid unauthorized commercial price agreements or competitor coordination.
- **Implemented now:** \`reviewPartnerEnablement\` blocks missing source version, partner grants and reviewed claims. No distributor send, account creation or price modification.

### 5.3 E14/E13 — AI Content Authenticity, Rights and Editable Design
- Track each \`DesignSource\` and \`Rendition\` separately; original/editable design refs are not flattened exports. Store SHA-256 digest, provider/source version, rendering options, permitted use, attribution, license conditions/expiry, territory, underlying inputs/stock/voice rights, AI-generated content disclosure and reviewer.
- Support C2PA/content-credentials evidence **when produced and cryptographically validated by an actual compatible provider**. \`SIGNED_VALID\` is a source assertion until independently verified, not an automatic certificate.
- Approval binds exact asset digest, source version, channels, claims and rights; any material edit, expiry, invalid signature or provider entitlement change invalidates it.
- **Implemented now:** \`reviewAssetAuthenticity\` checks digest match, rights window, declared editability and explicit content-credential state; returns \`approvalValid:false\` by construction. No content-signing or cryptographic C2PA verification is falsely claimed.

### 5.4 WF41 — Customer Onboarding, Adoption & Value Realization
- Guided setup: organization verified → brand owner and evidence → invited roles → agency grants and IAM → policy and billing → provider eligibility → first secure brief → approved draft/asset → dry-run → permitted channel publish → reconciled first outcome.
- Customer success: time-to-first-approved-campaign, activation completion, usage/feature adoption, qualified outcomes, supported integration health, training/support tickets, tenant profitability and renewal/retention indicators.
- Tenant suspension must preserve consent withdrawal, audit, data export and incident controls. Marketing agents cannot change subscription, access or finance records.
- **Implemented now:** \`reviewCustomerActivation\` is a conservative checklist; even with all boolean flags present it does **not** authorize a pilot or production. Verified IAM/brand/agency/entitlements, customer UAT and on-call release evidence are required.

## 6. Five added workflow families (v2.1)

| ID | Workflow | State flow | Owner | Target release |
| --- | --- | --- | --- | --- |
| WF37 | Search/AI discovery intelligence | approved query frame → eligible source capture → evidence validation → SEO/answer observations → sample analysis → owner review → approved content changes → observation comparison | MarketingLearningService | R4 |
| WF38 | Customer insight research | source purpose check → consent/source authorization → minimize/redact → aggregate/theme → bias/size review → human insight package → brand/product action proposal → impact measurement | MarketingLearningService, with Audience & Consent as data rights owner | R4 |
| WF39 | Corporate communications | authorized brief → facts/claims → PR draft/asset rights → brand/legal/scientific review → exact approval → future provider-approved distribution → receipt and earned coverage → corrections | CampaignService; BrandMaster and ApprovalService retained | R2 |
| WF40 | Sales and partner enablement | approved product/region/partner grant → source and claim check → message kit → brand/finance/legal review if needed → versioned partner distribution intent → receipt → adoption review | MarketingProduct + CampaignService | R4 |
| WF41 | Customer onboarding and value realization | signup/trial → organization/brand verification → identity/entitlements → provider eligibility → governed first campaign → activation evidence → support and success plan → lifecycle review | Tenancy & Commercial | R1 |

**Every workflow is currently only a design/reference family.** An actual runtime execution must use the existing \`MarketingWorkflowService\` /\`WorkflowExecution\` owner and durable events. No duplicate task queues. All potentially irreversible intents pass policy immediately before dispatch.

## 7. Data contracts, source models and API ownership

### New eventual authoritative schema (proposal, no migration in this tranche)
- \`SearchQueryCohort\`, \`DiscoveryObservation\`, \`SearchPropertyConnection\`: observed source, model/query corpus, sampled mention/citation, target URL, rights/terms, observation time and version. Stored under MarketingLearningService source-rights and event ledger; no fabricated SERP truth.
- \`FeedbackSourceGrant\`, \`FeedbackSignal\`, \`FeedbackThemeAssessment\`: purpose and retention are controlled by Audience & Consent; MarketingLearningService stores only pseudonymous/aggregated permitted evidence.
- \`PRBriefVersion\`, \`SpokespersonAuthorization\`, \`MediaAssetReference\`, \`CommunicationReleaseIntent\`, \`EarnedMediaObservation\`: campaign and creative/brand/approval ownership separated; no scraping/invented journalist address book.
- Extend existing \`MarketingMetricObservation\` and campaign attribution with scenario version and currency source, cost and margin evidence, exclusion logic and separately flagged causal conclusions.
- Extend planned \`AssetVersion\` /\`DesignSource\` /\`UsageRight\` with verification artifacts, editable-source capability, provenance and content-credential proof. Hash assertions are not equivalent to verified signatures.
- \`PartnerGrant\` is a scope reference to Tenancy & Commercial/partner contract authority, not a new entitlement created by MarketingProduct.
- Activation status is derived from independent identity/tenant/brand/approval/connection state; do not create a second tenant status table.

### API proposal (not currently live)
- \`GET /research/search-discovery\`, \`POST /research/search-discovery/review\`; \`GET /research/feedback\`, \`POST /research/feedback/assessment\`; \`GET /campaigns/pr-briefs\`; \`POST /campaigns/pr-briefs/:id/submit-review\`.
- \`POST /performance/revenue-scenarios/evaluate\`, \`GET /assets/:id/authenticity\`, \`POST /products/:id/partner-kits/review\`, \`GET /onboarding/activation\`.
- **Live implementation:** None of these new external endpoints exist. Initial deterministic reviewers are callable only via the established, authenticated internal agent invocation route with no new credentials or export right.

### Proposed versioned events (not emitted)
\`SearchObservationRecorded.v1\`, \`AIAnswerVisibilityReviewed.v1\`, \`FeedbackEvidenceAccepted.v1\`, \`CustomerInsightProposed.v1\`, \`PRBriefApproved.v1\`, \`MediaCommunicationOutcomeUnknown.v1\`, \`PartnerKitRightsChanged.v1\`, \`AssetProvenanceReviewed.v1\`, \`CustomerActivationAccepted.v1\`.

Owner commands must commit state plus OutboxEvent atomically. Inbox consumers deduplicate. Source-provider ambiguity remains \`OUTCOME_UNKNOWN\`, never presumed delivered.

## 8. Safety, economics and release governance

1. R1 commercial policy preflight \`authorizeCommercialScope\` now checks trusted identity, tenant/brand, verified revocable agency grant, actor grant, subscription entitlement, emergency hold, data region/purpose, provider capability and *independent exact content-digest approval*, plus consent for email or reservation for paid spend. This is **pure logic, not yet connected to the live API**.
2. For all customer/agent source data, identity, tenant and grants come from trusted server contexts. Booleans in user/LLM payloads cannot substitute for authority.
3. Search/VoC/PR output is internal and reviewed; all live research providers, websites, design tools, senders, AI models and publishing accounts require capability, rights, consent and budget decisions.
4. Do not market unmeasured GEO rankings, causal uplift, creative authenticity, true editability, proprietary customer profiles or regulatory certification.
5. Model-cost attribution and tenant subscription price/charges remain separate; optimizer proposals cannot change billing or finance.
6. Store data minimization/retention policy, rights, source IDs and any permitted demographic/fairness evaluation outside generic agent payloads; no hidden memory training from other tenants.
7. Independent human review is a necessary but not sufficient step for regulated scientific, investment, medical, corporate crisis and customer-specific statements.

## 9. Quality and competitive evidence

**No “best-in-class” badge from feature counts.** Measure customer task completion and independently verified end-to-end outcomes against selected competitor workflows and a prior customer baseline. Acceptance categories:
- Search discovery: permitted capture, source coverage, distinct AI answer vs SERP metrics, variability, no fake rank.
- VoC: reviewer-coded precision/recall, protected PII handling, cohort suppression, source-purpose revocation, multilingual and sentiment bias.
- PR: exact claims and identity approval, embargo/quote rights, crisis tabletop exercise, no unsanctioned release.
- Revenue: controlled experiments vs modelled assumptions, exact microcurrency handling, finance approvals and realized outcomes.
- DAM: hash invalidation, rights expiry, verified editable source, C2PA signature testing on supported providers, accessibility.
- Partner: product authority, territory grant revocation, finance/claims changes and distribution reconciliation.
- Onboarding: independently audited security and activation, accessibility, time-to-value and production-only signoff.
- All: cross-tenant IDOR, malicious prompt/tool input, low-privilege denial, ambiguous provider result, idempotency, retries, observability, cost and rollback.

Extend **existing 500-scenario planned E2E matrix** with these requirements in T07/T08/T09/T11/T13/T16; the number 500 remains a planning allocation and no new cases are claimed executed in that program.

## 10. Build order and exact next steps

**First tranche (implemented here):** canonical v2.1 registry, seven evidence-only logic functions, canonical agent dispatch, R1 preflight policy and negative unit tests. Do not mark downstream execution complete.

**Next tranche — R0/R1 hard authority:** on current code, design and migrate Organization/Brand/Membership/AgencyGrant/Role/Entitlement plus scoped PostgreSQL RLS; enforce commercial preflight in verified API/worker, add exact ApprovalService digest binding and DAM authority, prove two-tenant and agency revocation tests. In parallel resolve known security findings and stage worker+provider recovery.

**Then R2 customer workflow:** actual brand-approved brief → editable source asset → approved social intent → authorized provider receipt → source-reconciled analytics; add explicit consent/suppression and opted-in email as a separate controlled slice.

**Then R3/R4 extensions:** deeper manifest/memory/knowledge, dynamic teams, model/MCP/A2A adapters and workflow compiler; provider-backed SEO/VoC/PR/partner/revenue intelligence. Only then claim complete engines.

**Release truth rule:** \`PARTIAL\` means bounded advisory logic is present. \`VERIFIED_IMPLEMENTED\` requires real source data authority, provider eligibility, operational command, negative tests, staged and customer acceptance and documented rollback. No asset, agent, workflow or PR can self-authorize release.
