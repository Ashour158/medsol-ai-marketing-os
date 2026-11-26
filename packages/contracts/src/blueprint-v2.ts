/**
 * Master Blueprint v2.1 target-state register (v2.0 plus approved capability amendment).
 * Declarative classification only: NOTHING here registers executable agents,
 * exposes external network connectors, approves actions, or creates database owners.
 * Scope revision 2026-11-26 reconciles merged T1 adoption and durable workflows.
 * Partial means internal simulated or limited governance only,
 * NEVER permission to send or a production-ready customer capability.
 */
export type TargetRelease='R0'|'R1'|'R2'|'R3'|'R4'|'R5';
export type TargetState='NOT_IMPLEMENTED'|'DRAFT_ONLY'|'PARTIAL'|'VERIFIED_IMPLEMENTED';
export type TargetDomain={id:string;name:string;owner:string;release:TargetRelease;state:TargetState;goal?:string;blocker?:string};
export type TargetAlias={id:string;name:string;canonicalAgentId:string;state:'COGNITIVE_ALIAS_TARGET'|'PERSONA_ALIAS_TARGET'};
export const TARGET_ENGINES = [
  {
    "id": "E01",
    "name": "Business Discovery",
    "goal": "E01 Business profile intake",
    "release": "R1",
    "owner": "Business & Brand Knowledge",
    "state": "PARTIAL",
    "blocker": "Merged structured reviewed manual-source business-profile intake; authorized website/document extraction, authoritative revision selection and independent acceptance remain."
  },
  {
    "id": "E02",
    "name": "Brand Knowledge",
    "goal": "Versioned brand definitions and governed claims",
    "release": "R1",
    "owner": "BrandMasterRevision",
    "state": "PARTIAL",
    "blocker": "Tenant and brand entities plus approved tenant rule revisions; no brand-specific policy and claim-lineage completeness."
  },
  {
    "id": "E03",
    "name": "Market Research",
    "goal": "Source-backed market studies, reviewed exact-topic/sector watchlists, evidence-change alerts and permissioned source acquisition",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Persistent exact-topic watches and opt-in worker evaluation exist; permitted source import is quarantined; external acquisition and independent corroboration remain"
  },
  {
    "id": "E04",
    "name": "Audience Intelligence",
    "goal": "Synthetic-to-real audience intelligence, scoped contact lifecycle, purpose and segment evidence",
    "release": "R2",
    "owner": "Audience & Consent",
    "state": "PARTIAL",
    "blocker": "Synthetic audience and consent owner exists; real contact and segmentation authority remains gated"
  },
  {
    "id": "E05",
    "name": "Knowledge Retrieval",
    "goal": "Tenant scoped evidence pack with hybrid retrieval",
    "release": "R3",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Bounded local sparse-vector/lexical hybrid ranking, tenant ACL and source evidence; external model and independent acceptance remain."
  },
  {
    "id": "E06",
    "name": "Campaign Strategy",
    "goal": "Campaign lifecycle plan and strategy",
    "release": "R2",
    "owner": "CampaignService",
    "state": "PARTIAL",
    "blocker": "Basic campaign status and objective exist, not full strategy plan"
  },
  {
    "id": "E07",
    "name": "Editorial Planning",
    "goal": "Versioned editorial calendar linked to approved campaigns and exact creative revisions",
    "release": "R2",
    "owner": "CampaignService",
    "state": "PARTIAL",
    "blocker": "Canonical approval schedule calendar and conflict-aware advisory slots exist; mutable approved calendar coordination and external publishing remain"
  },
  {
    "id": "E08",
    "name": "Scheduling Optimizer",
    "goal": "Timing, frequency and provider constraints",
    "release": "R2",
    "owner": "CampaignService",
    "state": "PARTIAL",
    "blocker": "Bounded conflict analysis and advisory slot suggestions exist; no automatic rescheduling or verified platform timing constraints"
  },
  {
    "id": "E09",
    "name": "Commercial Opportunity",
    "goal": "Evidence-graded opportunities and BANT/ICP lead qualification with consent-bound CRM handoff",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Immutable synthetic BANT/ICP review and mock CRM protocol; actual lead/CRM authority remains."
  },
  {
    "id": "E10",
    "name": "Copywriting",
    "goal": "Versioned copy variants and approvals",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "blocker": "Stored layered title/body variants; standalone copy variant lifecycle and approvals remain."
  },
  {
    "id": "E11",
    "name": "Creative Production",
    "goal": "Editable layered designs, deterministic renders, rendition lineage, multimedia jobs and rights",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "blocker": "Persistent layered source and deterministic SVG plus verified synthetic PNG exist; layered release rendition, multiformat production and external editor remain"
  },
  {
    "id": "E12",
    "name": "Localization",
    "goal": "Approved copy derivatives for language and locale",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "blocker": "Versioned locale drafts and Arabic RTL rendering merged; independent translation validation, provider rendition and release approval remain"
  },
  {
    "id": "E13",
    "name": "Content Quality",
    "goal": "Factual, accessibility, rights and brand QA",
    "release": "R2",
    "owner": "BrandMasterService",
    "state": "PARTIAL",
    "blocker": "Stored revision-bound brand-policy advisory checks phrases, disclaimers, accents and contrast; independent factual, accessibility, translation and rights validation remain"
  },
  {
    "id": "E14",
    "name": "Digital Asset Management",
    "goal": "Versioned asset, source, license, editable layers, render provenance and rendition",
    "release": "R1",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "blocker": "Immutable DAM, independently reviewed rights and PNG verification, layered source and parent lineage exist; layered release rendition and multimedia remain"
  },
  {
    "id": "E15",
    "name": "Publishing",
    "goal": "Idempotent approved social publish and reconciliation",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "blocker": "Canonical publication intent, governed sandbox and 12 mock provider scenarios exist; no live delivery"
  },
  {
    "id": "E16",
    "name": "Platform Connectors",
    "goal": "Capability scoped official integration hub",
    "release": "R2",
    "owner": "Integration Hub",
    "state": "PARTIAL",
    "blocker": "Integration registry, OAuth custody and observation evidence exist; no verified customer binding or live adapters"
  },
  {
    "id": "E17",
    "name": "Social Listening",
    "goal": "Permissioned social listening, normalized inbound event fixtures, deduplication and case intake",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "blocker": "Synthetic discussion triage and durable case intake exist; authorized provider inbox/listening acquisition and verified receipts remain"
  },
  {
    "id": "E18",
    "name": "Community Management",
    "goal": "Durable community case routing, assignment, independent closure, reopen and reply receipts",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "blocker": "Durable internal case lifecycle, exact-round independent review, risk-prioritized queue and worker SLA escalation exist; authorized provider inbox/replies and professional credential verification remain"
  },
  {
    "id": "E19",
    "name": "Reputation & Crisis",
    "goal": "Risk-prioritized crisis case lifecycle, specialist decisions, escalation and response reconciliation",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "blocker": "Exact-round independent internal decisions, exact escalation counts and once-per-cycle opt-in SLA escalation exist; professional credentials and real crisis response remain unverified"
  },
  {
    "id": "E20",
    "name": "Analytics",
    "goal": "Source reconciled funnel and same-currency reported monetary metrics with exportable evidence",
    "release": "R2",
    "owner": "MarketingPerformanceService",
    "state": "PARTIAL",
    "blocker": "Same-source funnel and currency evidence/export; verified provider and finance source authority remain."
  },
  {
    "id": "E21",
    "name": "Attribution",
    "goal": "Conversion and CRM/finance attribution with explicit source lineage, currency and caveats",
    "release": "R4",
    "owner": "MarketingPerformanceService",
    "state": "PARTIAL",
    "blocker": "Reported metrics, synthetic CRM and independent qualification; no causal or actual financial reconciliation."
  },
  {
    "id": "E22",
    "name": "Experimentation",
    "goal": "Controlled experiments and holdout assignment",
    "release": "R4",
    "owner": "MarketingPerformanceService",
    "state": "PARTIAL",
    "blocker": "PR 137 merged: fixed assignments, exact approved forms, contamination checks, recorded mock outcomes; live assignment/outcome authority absent."
  },
  {
    "id": "E23",
    "name": "Learning & Optimization",
    "goal": "Versioned evaluated skill changes and rollbacks",
    "release": "R3",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Skill proposals have fixed safety tests, no runtime rollout"
  },
  {
    "id": "E24",
    "name": "Workflow Orchestration",
    "goal": "Versioned durable workflow and human tasks",
    "release": "R3",
    "owner": "MarketingWorkflowService",
    "state": "PARTIAL",
    "blocker": "Bounded authored signed offline DAG with persisted execution, human gates; general executable orchestration remains."
  },
  {
    "id": "E25",
    "name": "Approval & Policy",
    "goal": "Deterministic scope, digest, independent human decision and current version/consent checks",
    "release": "R1",
    "owner": "ApprovalService",
    "state": "PARTIAL",
    "blocker": "Exact creative/form/qualification/experiment approval evidence; external effects stay blocked."
  },
  {
    "id": "E26",
    "name": "Quality & Reliability",
    "goal": "Audit, incident, delivery and observability controls",
    "release": "R0",
    "owner": "MarketingIncidentResponseService",
    "state": "PARTIAL",
    "blocker": "Internal worker health and incidents; full SRE drills absent"
  },
  {
    "id": "E27",
    "name": "Multi-Model Gateway",
    "goal": "Policy aware AI provider routing and billing",
    "release": "R3",
    "owner": "GovernedModelService",
    "state": "PARTIAL",
    "blocker": "Multiple transport contracts and policy routing/reconciliation; no live provider entitlement or settled billing."
  },
  {
    "id": "E28",
    "name": "MCP & Tool Gateway",
    "goal": "Tenant scoped governed MCP and A2A interactions",
    "release": "R3",
    "owner": "AI Operations",
    "state": "PARTIAL",
    "blocker": "Signed MCP/A2A metadata lifecycle, scoped approval; no remote execution or peer interaction."
  },
  {
    "id": "E29",
    "name": "Audience & Consent",
    "goal": "Consent evidence, permanent suppression, purpose-scoped contacts and segments",
    "release": "R2",
    "owner": "Audience & Consent",
    "state": "PARTIAL",
    "blocker": "Synthetic consent, hard-bounce/complaint terminal suppression, mock feedback and immutable audience snapshots exist; no real legal consent"
  },
  {
    "id": "E30",
    "name": "Email & Journey",
    "goal": "Immutable email template, consent-bound audience, journey, delivery intent and mock transport outcomes",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "PARTIAL",
    "blocker": "Synthetic no-send journeys and strict mock sender-authentication preflight exist; verified ESP delivery, real DNS and legal consent remain"
  },
  {
    "id": "E31",
    "name": "Email Delivery & Reputation",
    "goal": "ESP protocol simulation, domain authentication evidence, delivery feedback, bounce/complaint/unsubscribe and reconciliation",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "PARTIAL",
    "blocker": "Durable synthetic feedback/suppression and mock sender SPF/DKIM/DMARC preflight exist; verified ESP callbacks and deliverability remain"
  },
  {
    "id": "E32",
    "name": "Brief & Design Coordination",
    "goal": "Brief parsing, approved creative tasks, storyboard and editable layered handoff",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "blocker": "Persistent layered title/body/accent and deterministic rendition lineage exist; multimodal brief and separately verified release render jobs remain"
  },
  {
    "id": "E33",
    "name": "Governed Web Acquisition",
    "goal": "Authorized web acquisition, source rights, bounded reviewed import, quarantine and evidence provenance",
    "release": "R4",
    "owner": "Market Research & Acquisition",
    "state": "PARTIAL",
    "blocker": "Explicit source rights, collection scope and expiry import into quarantine exist; rights declarations are not legal proof; general authorized fetch and independent verification remain"
  },
  {
    "id": "E34",
    "name": "Search & AI Discovery Intelligence",
    "goal": "SEO, AEO/GEO diagnostics, reviewed schema drafts and verified search visibility",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "MIT MeshPilot structured-data generators adopted for review only; verified site ownership, search connector and implementation acceptance remain"
  },
  {
    "id": "E35",
    "name": "Voice of Customer Intelligence",
    "goal": "Governed feedback research, source-backed cohort screening and community case evidence",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Existing cohort screening and synthetic community cases; verified survey/support/CRM sources and production permissions remain"
  },
  {
    "id": "E36",
    "name": "Corporate Communications & Earned Media",
    "goal": "Governed PR, media relations, executive communication and crisis review packages",
    "release": "R2",
    "owner": "CampaignService",
    "state": "PARTIAL",
    "blocker": "Draft risk triage exists; no earned-media distribution connector or public statements authority"
  }
] as const satisfies readonly TargetDomain[];
export const TARGET_WORKFLOWS = [
  {
    "id": "WF01",
    "name": "Tenant and agency onboarding",
    "release": "R1",
    "owner": "Tenancy & Commercial",
    "state": "PARTIAL",
    "blocker": "Tenant/brand/agency grant foundation; full customer onboarding and commercial entitlement remain."
  },
  {
    "id": "WF02",
    "name": "Brand intelligence onboarding",
    "release": "R1",
    "owner": "BrandMasterRevision",
    "state": "PARTIAL",
    "blocker": "Approved tenant brand rules; comprehensive business discovery and brand-specific onboarding remain."
  },
  {
    "id": "WF03",
    "name": "Social account connection",
    "release": "R2",
    "owner": "Social & Community",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent OAuth protocol trials only; actual account connection remains unimplemented."
  },
  {
    "id": "WF04",
    "name": "Marketing strategy",
    "release": "R2",
    "owner": "MarketingWorkflowService",
    "state": "PARTIAL",
    "blocker": "Canonical strategy brain and campaign workflow; complete strategic planning acceptance remains."
  },
  {
    "id": "WF05",
    "name": "Campaign plan and calendar",
    "release": "R2",
    "owner": "CampaignService",
    "state": "PARTIAL",
    "goal": "Approved campaign editorial coordination, timing constraints and version-bound publication schedule",
    "blocker": "Canonical approved schedule calendar and conflict-aware advisory suggestions exist; changing exact schedule requires new approval"
  },
  {
    "id": "WF06",
    "name": "Content production",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "goal": "Creative production with editable source, verified raster and rendition lineage",
    "blocker": "Persistent structured editable source and deterministic SVG with immutable lineage exist; separately verified layered release rendition remains"
  },
  {
    "id": "WF07",
    "name": "Content approval",
    "release": "R1",
    "owner": "ApprovalService",
    "state": "PARTIAL",
    "blocker": "Exact version/rights-bound approvals; external release gates remain."
  },
  {
    "id": "WF08",
    "name": "Social publishing",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "goal": "Approved exact social publication intent, mock transport and reconciliation",
    "blocker": "Governed sandbox exists; verified provider entitlement and real receipts remain"
  },
  {
    "id": "WF09",
    "name": "Community response",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "goal": "Synthetic community intake, assignment, independent closure and reopening",
    "blocker": "Durable internal queue and exact-round independent reviews exist; authorized live inbox/replies and credential verification remain"
  },
  {
    "id": "WF10",
    "name": "Crisis response",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "goal": "Risk-prioritized crisis escalation, independent internal review and incident response",
    "blocker": "Internal risk routing, exact-round review and opt-in automatic internal SLA escalation exist; external response and professional signoff remain"
  },
  {
    "id": "WF11",
    "name": "Analytics and learning",
    "release": "R3",
    "owner": "MarketingPerformanceService",
    "state": "PARTIAL",
    "goal": "Reviewed evidence, funnel and currency-separated monetary reconciliation, optimization",
    "blocker": "Source-record funnel/currency evidence and exports; verified revenue, causality and independent acceptance remain."
  },
  {
    "id": "WF12",
    "name": "Subscription and offboarding",
    "release": "R1",
    "owner": "Tenancy & Commercial",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent revocable delegation; subscription and complete offboarding workflow not established."
  },
  {
    "id": "WF13",
    "name": "AI provider lifecycle",
    "release": "R3",
    "owner": "GovernedModelService",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent provider contract trials and routing; full provider onboarding/entitlement lifecycle not established."
  },
  {
    "id": "WF14",
    "name": "MCP server lifecycle",
    "release": "R3",
    "owner": "AI Operations",
    "state": "PARTIAL",
    "blocker": "Signed scoped MCP/A2A registration/approval; live server execution lifecycle remains."
  },
  {
    "id": "WF15",
    "name": "Enterprise platform connection",
    "release": "R2",
    "owner": "Integration Hub",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent trial custody; actual enterprise connection/entitlement not established."
  },
  {
    "id": "WF16",
    "name": "Contact and consent intake",
    "release": "R2",
    "owner": "Audience & Consent",
    "state": "PARTIAL",
    "goal": "Synthetic contact, explicit purpose and immutable consent/suppression",
    "blocker": "Synthetic-only ledger exists; real purpose/legal consent remains unverified"
  },
  {
    "id": "WF17",
    "name": "Email campaign",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "PARTIAL",
    "goal": "Consent-bound email journey and mock transport",
    "blocker": "No-send journey and strict mock sender-auth preflight exist; verified live ESP and domain authentication remain"
  },
  {
    "id": "WF18",
    "name": "Delivery and preference event",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "PARTIAL",
    "goal": "Provider-shaped feedback, hard-bounce/complaint suppression, replay and receipt verification",
    "blocker": "Dittofeed mappings and durable synthetic suppression merged; no verified live webhook"
  },
  {
    "id": "WF19",
    "name": "Brief to creative design",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "goal": "Brief to layered editable design, verified render and independent rights review",
    "blocker": "Persisted layered source and deterministic SVG plus immutable parent lineage exist; verified release rendition and multimedia remain"
  },
  {
    "id": "WF20",
    "name": "Web source acquisition",
    "release": "R4",
    "owner": "Market Research & Acquisition",
    "state": "PARTIAL",
    "goal": "Governed source authorization, acquisition quarantine, provenance and evidence review",
    "blocker": "Manual permitted source rights import into quarantine and fixed Europe PMC exist; general permissioned network acquisition remains"
  },
  {
    "id": "WF21",
    "name": "Market report",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "goal": "Reviewed market diagnostics, source references, freshness and approved report",
    "blocker": "Reviewed market intelligence, persistent watches and opt-in due evaluation exist; independent corroboration and report delivery remain"
  },
  {
    "id": "WF22",
    "name": "Settings and privilege change",
    "release": "R1",
    "owner": "Identity & Governance",
    "state": "PARTIAL",
    "blocker": "Tenant role create/assign/disable controls; full settings and privilege change acceptance remain."
  },
  {
    "id": "WF23",
    "name": "Brand revision",
    "release": "R1",
    "owner": "BrandMasterRevision",
    "state": "PARTIAL",
    "blocker": "Versioned tenant master and independent approval; brand-specific policy remains."
  },
  {
    "id": "WF24",
    "name": "Price and promotion proposal",
    "release": "R4",
    "owner": "Product & Pricing Bridge",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent product catalog; price/promotion proposal and finance approval workflow not established."
  },
  {
    "id": "WF25",
    "name": "Product and portfolio lifecycle",
    "release": "R4",
    "owner": "MarketingProduct",
    "state": "PARTIAL",
    "blocker": "Catalog authority and scoped product linking; complete portfolio lifecycle remains."
  },
  {
    "id": "WF26",
    "name": "Loyalty and retention journey",
    "release": "R4",
    "owner": "Loyalty & Retention",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent synthetic journey; loyalty ledger/retention and financial liability not established."
  },
  {
    "id": "WF27",
    "name": "Agent factory and registration",
    "release": "R3",
    "owner": "AgentRuntime",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Signed canonical agent manifest releases; arbitrary agent factory/registration remains."
  },
  {
    "id": "WF28",
    "name": "Multi-agent team assembly",
    "release": "R3",
    "owner": "BrainRunLedgerService",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Fixed canonical brain sequencing; user-defined team assembly not established."
  },
  {
    "id": "WF29",
    "name": "Workflow design and release",
    "release": "R3",
    "owner": "MarketingWorkflowService",
    "state": "PARTIAL",
    "blocker": "Bounded signed offline workflow design and release; unrestricted execution remains blocked."
  },
  {
    "id": "WF30",
    "name": "Blueprint compilation and deployment",
    "release": "R3",
    "owner": "MarketingWorkflowService",
    "state": "PARTIAL",
    "blocker": "Durable virtual compilation and bounded signed offline execution; live deployment not authorized."
  },
  {
    "id": "WF31",
    "name": "Skill and learning release",
    "release": "R3",
    "owner": "SkillReleaseService",
    "state": "PARTIAL",
    "blocker": "Evaluated skill evidence and release controls; complete runtime rollout/rollback remains."
  },
  {
    "id": "WF32",
    "name": "Landing page and form conversion",
    "release": "R4",
    "owner": "Conversion & Growth",
    "state": "PARTIAL",
    "goal": "Immutable internal landing/form revision, exact approval and synthetic contact submission",
    "blocker": "Durable internal form and dedupe merged; public hosted intake and verified consent remain"
  },
  {
    "id": "WF33",
    "name": "Lead enrichment and CRM handoff",
    "release": "R4",
    "owner": "Conversion & Growth",
    "state": "PARTIAL",
    "goal": "BANT/ICP review, consent-gated synthetic CRM handoff and immutable ambiguous outcome",
    "blocker": "Independent synthetic qualification and mock request/readback; actual CRM and lead lifecycle remain."
  },
  {
    "id": "WF34",
    "name": "Paid advertising",
    "release": "R5",
    "owner": "Strategy & Campaign",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent graph safety only; paid media execution not implemented."
  },
  {
    "id": "WF35",
    "name": "Messaging WhatsApp SMS etc",
    "release": "R5",
    "owner": "Email & Messaging",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Adjacent email transport rehearsal; WhatsApp/SMS workflow not established."
  },
  {
    "id": "WF36",
    "name": "Proactive market and event watch",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "goal": "Persistent exact-topic watch, due evaluation, scheduling, evidence-change notification and lawful acquisition",
    "blocker": "Persistent watches, pause/resume and opt-in due evaluation through existing worker exist; lawful automatic acquisition and external notifications remain"
  },
  {
    "id": "WF37",
    "name": "Search, SEO and AI discovery review",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "goal": "Reviewed search diagnostics and structured-data drafts, verified site ownership and search connector",
    "blocker": "MIT MeshPilot SEO generators adopted; no verified external implementation"
  },
  {
    "id": "WF38",
    "name": "Customer insight and feedback research",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "goal": "Governed customer feedback and reviewed research with cohort boundaries",
    "blocker": "Merged immutable synthetic cohort intake, suppression, maker-checker review and revocation; verified source rights and real customer feedback remain"
  },
  {
    "id": "WF39",
    "name": "PR and earned-media approval and monitoring",
    "release": "R2",
    "owner": "CampaignService",
    "state": "DRAFT_ONLY",
    "goal": "PR, earned media risk assessment, approval and authorized monitoring",
    "blocker": "Draft risk screening exists; verified earned-media monitoring and publication remain"
  },
  {
    "id": "WF40",
    "name": "Sales and partner enablement",
    "release": "R4",
    "owner": "MarketingProduct",
    "state": "DRAFT_ONLY",
    "goal": "Partner/sales enablement with authoritative product, territory and approved material",
    "blocker": "Approved content and commercial review still need integrated partner workflow"
  },
  {
    "id": "WF41",
    "name": "Customer onboarding and value realization",
    "release": "R1",
    "owner": "Tenancy & Commercial",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Customer activation acceptance helper; actual onboarding/value realization lifecycle not established."
  }
] as const satisfies readonly TargetDomain[];
export const TARGET_STUDIOS = [
  {
    "id": "S01",
    "name": "Executive Command Center",
    "release": "R1",
    "owner": "MarketingCommandCenterService",
    "state": "PARTIAL"
  },
  {
    "id": "S02",
    "name": "Market Intelligence Lab",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL"
  },
  {
    "id": "S03",
    "name": "Campaign & Journey Studio",
    "release": "R2",
    "owner": "CampaignService",
    "state": "PARTIAL"
  },
  {
    "id": "S04",
    "name": "Creative & Brief Studio",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "blocker": "Internal simulated operator surface exists; full external integration and independent acceptance remain"
  },
  {
    "id": "S05",
    "name": "Social & Community Studio",
    "release": "R2",
    "owner": "Social & Community",
    "state": "PARTIAL",
    "blocker": "Internal simulated operator surface exists; full external integration and independent acceptance remain"
  },
  {
    "id": "S06",
    "name": "Email & Messaging Studio",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "PARTIAL",
    "blocker": "Internal simulated operator surface exists; full external integration and independent acceptance remain"
  },
  {
    "id": "S07",
    "name": "Conversion & Revenue Studio",
    "release": "R4",
    "owner": "Conversion & Growth",
    "state": "PARTIAL",
    "blocker": "Internal simulated operator surface exists; full external integration and independent acceptance remain"
  },
  {
    "id": "S08",
    "name": "Agent Studio",
    "release": "R3",
    "owner": "AgentRuntime",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "S09",
    "name": "Workflow Studio",
    "release": "R3",
    "owner": "MarketingWorkflowService",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "S10",
    "name": "Blueprint Studio",
    "release": "R3",
    "owner": "MarketingWorkflowService",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "S11",
    "name": "Knowledge & Learning Studio",
    "release": "R3",
    "owner": "MarketingLearningService",
    "state": "PARTIAL"
  },
  {
    "id": "S12",
    "name": "Administration & Settings",
    "release": "R1",
    "owner": "Identity & Governance",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "S13",
    "name": "Operations & Reliability",
    "release": "R0",
    "owner": "MarketingIncidentResponseService",
    "state": "PARTIAL"
  }
] as const satisfies readonly TargetDomain[];
export const TARGET_BRAINS = [
  {
    "id": "B01",
    "name": "Executive Director",
    "canonicalAgentId": "MKT-CMO-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B02",
    "name": "Business and Brand",
    "canonicalAgentId": "MKT-BRAND-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B03",
    "name": "Market and Audience",
    "canonicalAgentId": "MKT-STR-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B04",
    "name": "Strategy",
    "canonicalAgentId": "MKT-CMO-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B05",
    "name": "Creative",
    "canonicalAgentId": "MKT-CREATIVE-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B06",
    "name": "Community",
    "canonicalAgentId": "MKT-SOC-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B07",
    "name": "Performance",
    "canonicalAgentId": "MKT-ANA-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B08",
    "name": "Risk and Scientific",
    "canonicalAgentId": "MKT-SCI-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B09",
    "name": "Learning",
    "canonicalAgentId": "MKT-ANA-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  },
  {
    "id": "B10",
    "name": "Commercial",
    "canonicalAgentId": "MKT-GROWTH-001",
    "state": "COGNITIVE_ALIAS_TARGET"
  }
] as const satisfies readonly TargetAlias[];
export const TARGET_PERSONAS = [
  {
    "id": "AG-DIRECTOR",
    "name": "Marketing Director",
    "canonicalAgentId": "MKT-CMO-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-BRAND",
    "name": "Branding",
    "canonicalAgentId": "MKT-BRAND-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-PRICE",
    "name": "Pricing and Promotions",
    "canonicalAgentId": "MKT-PM-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-PRODUCT",
    "name": "Product Marketing",
    "canonicalAgentId": "MKT-PM-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-LOYAL",
    "name": "Loyalty and Retention",
    "canonicalAgentId": "MKT-CRM-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-MARKET",
    "name": "Market Intelligence",
    "canonicalAgentId": "MKT-STR-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-CREATIVE",
    "name": "Creative",
    "canonicalAgentId": "MKT-CREATIVE-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-SOCIAL",
    "name": "Social Ops",
    "canonicalAgentId": "MKT-SOC-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-EMAIL",
    "name": "Email and Journey",
    "canonicalAgentId": "MKT-CRM-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-COMMUNITY",
    "name": "Community and Reputation",
    "canonicalAgentId": "MKT-SOC-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-ANALYTICS",
    "name": "Performance",
    "canonicalAgentId": "MKT-ANA-001",
    "state": "PERSONA_ALIAS_TARGET"
  },
  {
    "id": "AG-GOVERNANCE",
    "name": "Risk Review Assistant",
    "canonicalAgentId": "MKT-SCI-001",
    "state": "PERSONA_ALIAS_TARGET"
  }
] as const satisfies readonly TargetAlias[];
export const TARGET_COUNTS = {engines:36,workflows:41,studios:13,brains:10,personas:12} as const;
export const RELEASE_GATES = {
 R0:['Migration dry-run on existing data','Multi-process staging fault injection','Provider billing discrepancy governance','High vulnerability review','Restore drill'],
 R1:['Two tenants and agency grant isolation','PostgreSQL RLS on tenant tables','Scoped IAM/ABAC and entitlement checks','Exact content/audience approval binding','Versioned asset rights'],
 R2:['One tested social API capability','Approved post external intent and reconciliation','Editable design provenance','Email consent and suppression','Brief-to-publish UAT'],
 R3:['Bounded, versioned team and workflow compiler','Multi-model policy and cost settlement','MCP/A2A trust and tool governance','Hybrid knowledge ACL and memory deletion','Evaluated agent and skill release'],
 R4:['Lawful source acquisition','Verified CRM/PIM authority','Price margin and finance approvals','Loyalty financial liability','Conversion attribution provenance'],
 R5:['Paid media provider permissions','Messaging opt-in and templates','Influencer and commerce legal review','Marketplace package security']
} as const;
export type BlueprintInventory={
 version:'2.1';asOfCommit:string;targetStateOnly:true;
 counts:typeof TARGET_COUNTS;engines:typeof TARGET_ENGINES;workflows:typeof TARGET_WORKFLOWS;
 studios:typeof TARGET_STUDIOS;brains:typeof TARGET_BRAINS;personas:typeof TARGET_PERSONAS;
 releaseGates:typeof RELEASE_GATES;
};
export function getBlueprintV2Inventory():BlueprintInventory {
 return {version:'2.1',asOfCommit:'035d4d556a08eaa37ab75cf1c7446a91c99cb8db',
  targetStateOnly:true,counts:TARGET_COUNTS,engines:TARGET_ENGINES,
  workflows:TARGET_WORKFLOWS,studios:TARGET_STUDIOS,
  brains:TARGET_BRAINS,personas:TARGET_PERSONAS,releaseGates:RELEASE_GATES};
}
