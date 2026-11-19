# R2/R3 release acceptance audit — 19 November 2026

**Audit verdict: NOT CERTIFIED / NO PRODUCTION RELEASE.** This is an internal code-and-CI evidence review, not a third-party security audit, legal assessment, penetration test, provider sandbox acceptance, disaster-recovery certification or customer UAT.

## Scope and Reuse Map
- R2 campaign/approval/creative: existing CampaignService, ApprovalService, CreativeAssetService, CampaignPublicationService, PublicationAttempt, VerifiedMediaEvidence, PlatformIntegrationHubService and canonical audit/outbox.
- R2 audience/email: existing SyntheticAudienceEmailService, append-only synthetic consent and MarketingEmailSimulation. **These are not legally sendable contacts.**
- R3 agents/brains: canonical 13-agent AGENT_ROSTER, AgentService, BrainRunLedgerService, BrainRunExecutorService.
- R3 workflow: MarketingWorkflowService and WorkflowExecution/WorkflowStepExecution remain the only runtime ledger; blueprint compiler/simulator are virtual-only.
- R3 model/budget: GovernedModelService, BoundedModelGateway, ModelBudgetService. OpenAI, Anthropic and Gemini adapter contracts are not evidence of provider acceptance.
- R3 MCP/A2A: GovernedToolRegistryService owns signed **metadata**, not external invocation; existing tenant OIDC, AuditEvent and OutboxEvent own governance.
- R3 learning: MarketingLearningService and SkillReleaseService remain the only learning and promotion authorities.

## Evidence inspected
- Master Blueprint v2.1 and implementation control; R2F release barrier; R2H/R2I/R2J email simulation; R3A virtual workflow; R3C/R3D model contracts; R3E signed tool registry.
- Merged PR [#37](https://github.com/Ashour158/medsol-ai-marketing-os/pull/37), [#38](https://github.com/Ashour158/medsol-ai-marketing-os/pull/38), [#39](https://github.com/Ashour158/medsol-ai-marketing-os/pull/39), [#40](https://github.com/Ashour158/medsol-ai-marketing-os/pull/40).
- CI runs [R2J #44535223029](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44535223029) and [R3E #44535405339](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44535405339): verified typecheck, clean and historical PostgreSQL migration rehearsal, tests, build, dependency audit and SBOM. These are **software regression evidence**, not full release certification.
- The companion `r2-r3-release-safety-audit.test.ts` provides additional negative controls: forbidden endpoints, locked official provider gateway, all 12 social and 12 ESP scenarios, no-send virtual journeys, signed MCP/A2A no-egress, blueprint virtual-only and four offline model protocols. This test requires its own CI success before counting as passed.
- [500-case quality program](QUALITY_500_CASE_PROGRAM.md) explicitly remains a **planned** E2E allocation, not 500 executed or passed scenarios.

## R2 acceptance findings

| Gate | Classification | Evidence / outstanding requirement |
|---|---|---|
| Approved campaign and exact-scope creative authorization | TESTED OFFLINE | Canonical approval and immutable scope checks; current no-send/no-publish policy |
| Media object digest, rights and malware evidence | PARTIAL | Isolated evidence contracts; production object-store/scanner credentials and customer byte-readback not accepted |
| Editable source, image/video design, QA and provenance | INCOMPLETE | No accepted end-to-end editable design provider/rendition production |
| Scheduled social intent and provider simulations | TESTED OFFLINE | Twelve scenarios; no actual provider account or remote publish |
| Official eligible Meta/LinkedIn app and account binding | BLOCKED EXTERNAL | No reviewed app entitlement, verified customer destination and scope |
| Actual publication dispatch, durable unknown-outcome recovery | BLOCKED EXTERNAL | Backend and SQL intentionally prohibit real remote publish and PUBLISHED |
| Signed webhook + independent provider GET readback of an actual post | BLOCKED EXTERNAL | Quarantined source evidence is not a verified outbound receipt |
| Real contact provenance, legal opt-in, double opt-in and suppression | INCOMPLETE | Existing audience is explicitly synthetic, no actual email address or legal consent |
| ESP domain authentication, verified sender, reputation and signed feedback | BLOCKED EXTERNAL | No connected domain, ESP or delivery feedback authority |
| Real bulk/journey email dispatch, unsubscribe and abuse response | BLOCKED EXTERNAL | No send endpoint; virtual DST-aware scheduling and caps only |
| Cross-channel real campaign and source-reconciled attribution | INCOMPLETE | Reviewed observations exist, but no genuine social/ESP delivery receipts |
| Full customer-facing R2 UI, accessibility and multi-tenant UAT | NOT VERIFIED | Admin studios exist; no independent production customer E2E/accessibility signoff |

**R2 verdict:** Engineering foundations and offline simulation are substantial. The explicit R2 exit criterion—one eligible external customer campaign end-to-end, without unauthorized or duplicate effects—has **not** been met.

## R3 acceptance findings

| Gate | Classification | Evidence / outstanding requirement |
|---|---|---|
| Canonical agent roster and bounded brain execution | PARTIAL | 13 agents and durable run ledger; deep autonomous work and skill quality not certified |
| Signed, versioned per-agent manifests and approved rollback | INCOMPLETE | Canonical roster exists; no complete signed runtime manifest release lifecycle |
| Model adapter protocols and budget reservation | TESTED OFFLINE | OpenAI/Anthropic/Gemini contracts and offline four-provider simulations; estimated cost is not provider billing |
| Tenant-specific BYOK, region, model capability and invoice reconciliation | INCOMPLETE | Production tenant vault/routing and independently verified billing not accepted |
| MCP/A2A signed registry, maker-checker and revocation | TESTED OFFLINE | R3E Ed25519 metadata, OIDC, FORCE RLS, SQL immutability and no-egress inspector |
| MCP/A2A real remote execution, DNS/SSRF protection, schemas and isolation | INCOMPLETE | No audited execution adapter, endpoint DNS pinning, tool output quarantine or external peer acceptance |
| Workflow/Blueprint DSL static lint and deterministic simulation | TESTED OFFLINE | Canonical graph compiler and persisted virtual WorkflowExecution; zero real agent/tool calls |
| Approved version-pinned workflow deployment, human waits, canary and rollback | INCOMPLETE | No signed deploy command or durable general DAG executor |
| Tenant/brand ACL hybrid lexical/vector knowledge, deletion and legal hold | INCOMPLETE | Reviewed LearningSignal registry is not a hybrid RAG knowledge fabric |
| Evaluated learning and human skill review | PARTIAL | Human-gated proposal/evaluation exists; deep knowledge and regression-backed release/rollback incomplete |
| End-to-end multi-tenant/agency-revocation and legacy RLS coverage | PARTIAL | Specific new tables have actual PostgreSQL FORCE RLS tests; full legacy/global coverage not proven |
| Two-worker crash, backups/restore, scale and on-call drills | NOT VERIFIED | CI migration rehearsal is not production restore, failover or DR evidence |
| Full 500-case E2E and red-team/UX accessibility suite | NOT VERIFIED | The 500-case document is a plan, not completed test evidence |

**R3 verdict:** Signed tool metadata and model adapter contracts improve the control plane, but the full extensible agentic runtime and knowledge fabric are not complete.

## Critical release blockers (P0)
1. No legal consent/contact provenance and no verified sender/ESP; real email remains prohibited.
2. No approved official social destination and no authorized remote publish/readback lifecycle.
3. No signed, version-pinned deployable general workflow runtime with durable waits and rollback.
4. No audited remote MCP/A2A gateway, credential isolation and output validation.
5. No full tenant/brand ACL knowledge fabric or per-agent signed manifest release lifecycle.
6. No full 500-case E2E, provider sandbox, independent security review, customer UAT and DR signoff.

## Acceptance policy
A green CI build, SBOM or simulation **cannot** change either release to COMPLETE. Each gate must have an owner, tested implementation, test-run URL, production/staging proof where required, security/privacy/legal signoff, rollback procedure and independent operator acceptance. Critical P0 failures are non-waivable. The user-directed no-account phase is preserved: no credentials are requested or connected in this audit.

**Current release state: R2 = PARTIAL; R3 = PARTIAL; production external effects = DISABLED; certification = DENIED.**
