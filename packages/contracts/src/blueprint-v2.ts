/**
 * Master Blueprint v2.1 target-state register (v2.0 plus approved capability amendment).
 * Declarative classification only: NOTHING here registers executable agents,
 * exposes external network connectors, approves actions, or creates database owners.
 * Status is revised by linked acceptance slices through R2H synthetic
 * email/consent; partial means internal simulated or limited governance only,
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
    "state": "NOT_IMPLEMENTED",
    "blocker": "Website, docs and human validation required"
  },
  {
    "id": "E02",
    "name": "Brand Knowledge",
    "goal": "Versioned brand definitions and governed claims",
    "release": "R1",
    "owner": "BrandMasterRevision",
    "state": "PARTIAL",
    "blocker": "One approved brand rule revision exists; multi-brand, rights and claim lineage absent"
  },
  {
    "id": "E03",
    "name": "Market Research",
    "goal": "Source-backed market studies and competitor findings",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "DRAFT_ONLY",
    "blocker": "Current fixed Europe PMC research is not general market intelligence"
  },
  {
    "id": "E04",
    "name": "Audience Intelligence",
    "goal": "Consented audience insights and segment hypotheses",
    "release": "R2",
    "owner": "Audience & Consent",
    "state": "NOT_IMPLEMENTED",
    "blocker": "No contact or consent master"
  },
  {
    "id": "E05",
    "name": "Knowledge Retrieval",
    "goal": "Tenant scoped evidence pack with hybrid retrieval",
    "release": "R3",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Lexical Europe PMC ranking only, not hybrid RAG"
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
    "goal": "Calendar linked to approved campaigns",
    "release": "R2",
    "owner": "CampaignService",
    "state": "DRAFT_ONLY",
    "blocker": "Agent suggests schedules, no authoritative editorial calendar"
  },
  {
    "id": "E08",
    "name": "Scheduling Optimizer",
    "goal": "Timing, frequency and provider constraints",
    "release": "R2",
    "owner": "CampaignService",
    "state": "NOT_IMPLEMENTED",
    "blocker": "No campaign scheduling service"
  },
  {
    "id": "E09",
    "name": "Commercial Opportunity",
    "goal": "Evidence graded opportunity recommendations",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "DRAFT_ONLY",
    "blocker": "No qualified opportunity owner or score provenance"
  },
  {
    "id": "E10",
    "name": "Copywriting",
    "goal": "Versioned copy variants and approvals",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "DRAFT_ONLY",
    "blocker": "Text recommendation only, no copy version record"
  },
  {
    "id": "E11",
    "name": "Creative Production",
    "goal": "Editable designs, renditions, render jobs and rights",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "NOT_IMPLEMENTED",
    "blocker": "No editable design or source rendition authority"
  },
  {
    "id": "E12",
    "name": "Localization",
    "goal": "Approved copy derivatives for language and locale",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "NOT_IMPLEMENTED",
    "blocker": "No versioned locale renditions"
  },
  {
    "id": "E13",
    "name": "Content Quality",
    "goal": "Factual, accessibility, rights and brand QA",
    "release": "R2",
    "owner": "BrandMasterService",
    "state": "DRAFT_ONLY",
    "blocker": "Some brand review concepts, no asset QA pipeline"
  },
  {
    "id": "E14",
    "name": "Digital Asset Management",
    "goal": "Versioned asset, source, license and rendition",
    "release": "R1",
    "owner": "Creative & DAM",
    "state": "PARTIAL",
    "blocker": "Versioned DAM and independent rights review exist; editable design/source verification and production creatives pending"
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
    "goal": "Permissioned social interaction observation",
    "release": "R2",
    "owner": "Social & Community",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Current social triage accepts input, no connected listening"
  },
  {
    "id": "E18",
    "name": "Community Management",
    "goal": "Human-governed response case routing",
    "release": "R2",
    "owner": "Social & Community",
    "state": "DRAFT_ONLY",
    "blocker": "Classification not live inbox or case workflow"
  },
  {
    "id": "E19",
    "name": "Reputation & Crisis",
    "goal": "Human-governed reputation crisis cases",
    "release": "R2",
    "owner": "Social & Community",
    "state": "DRAFT_ONLY",
    "blocker": "Screening only, no crisis command state"
  },
  {
    "id": "E20",
    "name": "Analytics",
    "goal": "Source reconciled marketing metrics and reporting",
    "release": "R2",
    "owner": "MarketingPerformanceService",
    "state": "PARTIAL",
    "blocker": "Manual reviewed observations and KPIs, not verified connector metrics"
  },
  {
    "id": "E21",
    "name": "Attribution",
    "goal": "Conversion attribution with caveats and lineage",
    "release": "R4",
    "owner": "MarketingPerformanceService",
    "state": "DRAFT_ONLY",
    "blocker": "No campaign-to-revenue attribution ledger"
  },
  {
    "id": "E22",
    "name": "Experimentation",
    "goal": "Controlled experiments and holdout assignment",
    "release": "R4",
    "owner": "MarketingPerformanceService",
    "state": "DRAFT_ONLY",
    "blocker": "Experiment plans only"
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
    "blocker": "Fixed lifecycle and Brain sequence, not user-authored graph"
  },
  {
    "id": "E25",
    "name": "Approval & Policy",
    "goal": "Deterministic scope, hash and human decision",
    "release": "R1",
    "owner": "ApprovalService",
    "state": "PARTIAL",
    "blocker": "Basic human approval; exact content/audience binding absent"
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
    "blocker": "Optional OpenAI only, limited billing reconciliation"
  },
  {
    "id": "E28",
    "name": "MCP & Tool Gateway",
    "goal": "Tenant scoped governed MCP and A2A interactions",
    "release": "R3",
    "owner": "AI Operations",
    "state": "NOT_IMPLEMENTED",
    "blocker": "No MCP tool gateway or A2A peer registry"
  },
  {
    "id": "E29",
    "name": "Audience & Consent",
    "goal": "Consent evidence, suppression and segments",
    "release": "R2",
    "owner": "Audience & Consent",
    "state": "PARTIAL",
    "blocker": "Synthetic-only consent, complaints, withdrawals and immutable audience snapshots; no real contact or legal consent"
  },
  {
    "id": "E30",
    "name": "Email & Journey",
    "goal": "Immutable email template, audience and send intent",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "PARTIAL",
    "blocker": "Synthetic-only campaign email audience eligibility and immutable no-send batch; no ESP or legal contact master"
  },
  {
    "id": "E31",
    "name": "Email Delivery & Reputation",
    "goal": "ESP dispatch, bounce and unsubscribe",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "NOT_IMPLEMENTED",
    "blocker": "No ESP verified adapters"
  },
  {
    "id": "E32",
    "name": "Brief & Design Coordination",
    "goal": "Brief parse into creative tasks and storyboard",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "NOT_IMPLEMENTED",
    "blocker": "No multi-modal intake or editable design handoff"
  },
  {
    "id": "E33",
    "name": "Governed Web Acquisition",
    "goal": "Authorized web fetch and source policy",
    "release": "R4",
    "owner": "Market Research & Acquisition",
    "state": "NOT_IMPLEMENTED",
    "blocker": "Europe PMC fixed API is not general governed acquisition"
  }
,
  {
    "id": "E34",
    "name": "Search & AI Discovery Intelligence",
    "goal": "SEO, AEO/GEO and evidenced search/AI answer visibility diagnostics",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Deterministic evidence review exists; no authorized search-console/AI answer data connector or search operations authority"
  },
  {
    "id": "E35",
    "name": "Voice of Customer Intelligence",
    "goal": "Privacy-preserving first-party feedback themes and unmet-needs intelligence",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "PARTIAL",
    "blocker": "Governed cohort screening exists; no survey/support/CRM provider connection or production contact permissions"
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
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF02",
    "name": "Brand intelligence onboarding",
    "release": "R1",
    "owner": "BrandMasterRevision",
    "state": "PARTIAL"
  },
  {
    "id": "WF03",
    "name": "Social account connection",
    "release": "R2",
    "owner": "Social & Community",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF04",
    "name": "Marketing strategy",
    "release": "R2",
    "owner": "MarketingWorkflowService",
    "state": "PARTIAL"
  },
  {
    "id": "WF05",
    "name": "Campaign plan and calendar",
    "release": "R2",
    "owner": "CampaignService",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF06",
    "name": "Content production",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF07",
    "name": "Content approval",
    "release": "R1",
    "owner": "ApprovalService",
    "state": "PARTIAL"
  },
  {
    "id": "WF08",
    "name": "Social publishing",
    "release": "R2",
    "owner": "Social & Community",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF09",
    "name": "Community response",
    "release": "R2",
    "owner": "Social & Community",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF10",
    "name": "Crisis response",
    "release": "R2",
    "owner": "Social & Community",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF11",
    "name": "Analytics and learning",
    "release": "R3",
    "owner": "MarketingPerformanceService",
    "state": "PARTIAL"
  },
  {
    "id": "WF12",
    "name": "Subscription and offboarding",
    "release": "R1",
    "owner": "Tenancy & Commercial",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF13",
    "name": "AI provider lifecycle",
    "release": "R3",
    "owner": "GovernedModelService",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF14",
    "name": "MCP server lifecycle",
    "release": "R3",
    "owner": "AI Operations",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF15",
    "name": "Enterprise platform connection",
    "release": "R2",
    "owner": "Integration Hub",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF16",
    "name": "Contact and consent intake",
    "release": "R2",
    "owner": "Audience & Consent",
    "state": "PARTIAL"
  },
  {
    "id": "WF17",
    "name": "Email campaign",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "PARTIAL"
  },
  {
    "id": "WF18",
    "name": "Delivery and preference event",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF19",
    "name": "Brief to creative design",
    "release": "R2",
    "owner": "Creative & DAM",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF20",
    "name": "Web source acquisition",
    "release": "R4",
    "owner": "Market Research & Acquisition",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF21",
    "name": "Market report",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF22",
    "name": "Settings and privilege change",
    "release": "R1",
    "owner": "Identity & Governance",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF23",
    "name": "Brand revision",
    "release": "R1",
    "owner": "BrandMasterRevision",
    "state": "PARTIAL"
  },
  {
    "id": "WF24",
    "name": "Price and promotion proposal",
    "release": "R4",
    "owner": "Product & Pricing Bridge",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF25",
    "name": "Product and portfolio lifecycle",
    "release": "R4",
    "owner": "MarketingProduct",
    "state": "PARTIAL"
  },
  {
    "id": "WF26",
    "name": "Loyalty and retention journey",
    "release": "R4",
    "owner": "Loyalty & Retention",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF27",
    "name": "Agent factory and registration",
    "release": "R3",
    "owner": "AgentRuntime",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF28",
    "name": "Multi-agent team assembly",
    "release": "R3",
    "owner": "BrainRunLedgerService",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF29",
    "name": "Workflow design and release",
    "release": "R3",
    "owner": "MarketingWorkflowService",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF30",
    "name": "Blueprint compilation and deployment",
    "release": "R3",
    "owner": "MarketingWorkflowService",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF31",
    "name": "Skill and learning release",
    "release": "R3",
    "owner": "SkillReleaseService",
    "state": "PARTIAL"
  },
  {
    "id": "WF32",
    "name": "Landing page and form conversion",
    "release": "R4",
    "owner": "Conversion & Growth",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF33",
    "name": "Lead enrichment and CRM handoff",
    "release": "R4",
    "owner": "Conversion & Growth",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF34",
    "name": "Paid advertising",
    "release": "R5",
    "owner": "Strategy & Campaign",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF35",
    "name": "Messaging WhatsApp SMS etc",
    "release": "R5",
    "owner": "Email & Messaging",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "WF36",
    "name": "Proactive market and event watch",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "NOT_IMPLEMENTED"
  }
,
  {
    "id": "WF37",
    "name": "Search, SEO and AI discovery review",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF38",
    "name": "Customer insight and feedback research",
    "release": "R4",
    "owner": "MarketingLearningService",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF39",
    "name": "PR and earned-media approval and monitoring",
    "release": "R2",
    "owner": "CampaignService",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF40",
    "name": "Sales and partner enablement",
    "release": "R4",
    "owner": "MarketingProduct",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "WF41",
    "name": "Customer onboarding and value realization",
    "release": "R1",
    "owner": "Tenancy & Commercial",
    "state": "NOT_IMPLEMENTED"
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
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "S05",
    "name": "Social & Community Studio",
    "release": "R2",
    "owner": "Social & Community",
    "state": "DRAFT_ONLY"
  },
  {
    "id": "S06",
    "name": "Email & Messaging Studio",
    "release": "R2",
    "owner": "Email & Messaging",
    "state": "NOT_IMPLEMENTED"
  },
  {
    "id": "S07",
    "name": "Conversion & Revenue Studio",
    "release": "R4",
    "owner": "Conversion & Growth",
    "state": "NOT_IMPLEMENTED"
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
 return {version:'2.1',asOfCommit:'57cfda8e61acd9949e939c424fb8501b25a53da3',
  targetStateOnly:true,counts:TARGET_COUNTS,engines:TARGET_ENGINES,
  workflows:TARGET_WORKFLOWS,studios:TARGET_STUDIOS,
  brains:TARGET_BRAINS,personas:TARGET_PERSONAS,releaseGates:RELEASE_GATES};
}
