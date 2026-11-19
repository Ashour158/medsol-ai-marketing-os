# R2/R3 combined implementation tranche — blueprint-aligned safety and gap register

## Reuse Map
- **R3 Blueprint Studio graph authority:** `packages/contracts/src/blueprint-v2-compiler.ts` remains the only static graph validator; `blueprint-v2-simulator.ts` remains pure virtual execution, and `MarketingWorkflowService` remains the sole persistence and workflow execution authority. Do not create a parallel executor.
- **R2 social simulation:** `CampaignPublicationService`, existing Integration Hub catalog, `social-provider-simulation.ts`, `PublicationAttempt`, `ApprovalService` and Audit/Outbox remain the only simulation and evidence owners. No provider calls, no second receipt store.
- **R2 email and consent:** existing R2H anonymous consent and no-send audience snapshot authorities. Do not turn anonymous simulated recipients into actual sendable contacts without new consent/provenance controls.
- **R3 agent runtime:** existing 13 canonical agents, BrainRunLedgerService and BrainRunExecutorService; target personas are aliases, not independent identities.
- **R3 model, MCP and learning:** GovernedModelService, ModelBudgetService, MarketingLearningService and SkillReleaseService are existing owners. No new autonomous key or model authorization route.

## Implemented in this tranche: R3-B graph contract hardening
- Require exactly one trigger; every node must be reachable from that trigger and must have a path to END. This blocks orphan approvals, hidden branches and unfinished workflows that the previous lint accepted.
- Fail closed on unrecognized node configuration fields, agent references on non-agent nodes, misplaced loop bounds or deadlines. Existing unsupported MCP/A2A/domain nodes and all external effects stay denied.
- Preserve deterministic, no-effect topological simulation, zero actual agent/model/tool calls, and existing canonical workflow persistence. New negative regression cases exercise dangling branches, extra triggers, and covert HTTP URLs.
- This is an **authoring/simulation safety improvement**. It does not deploy blueprints or claim full R3.

## Outstanding R2 scope (not complete)
- Actual editable creative source/renditions, design adapters, QA and brief-to-asset automation.
- Durable schedule/calendar optimization and multi-platform simulated provider contract testing across publication lifecycle.
- Real contact provenance, segmentation, double opt-in, suppression, compliant ESP simulation, journey automation and sender reputation. R2H anonymous snapshots cannot send.
- End-to-end campaign journey linking creative, approval, scheduled social/email simulated dispatch, verified **synthetic** receipts and source-labelled performance; independently accepted UI E2E.
- Tenant IAM and rights/region/commercial entitlement acceptance across the full system.

## Outstanding R3 scope (not complete)
- Signed agent manifests, per-agent deep knowledge, skill evaluations, controlled memory, delegation and rollback.
- Governed multi-provider OpenAI/Anthropic/Gemini adapters, routing/cost/BYOK and failover.
- MCP/A2A registry with T0–T3 trust, schema enforcement, isolation, revocation, red-team.
- Workflow/Blueprint Studio versioning, signed deployment, durable node runtime, operator policy, canary/rollback and visual editor.
- Tenant/brand ACL hybrid RAG and evaluated learning release, evidence freshness, deletion and legal hold.
- Real two-worker crash recovery, restored database and complete customer UAT.

## Acceptance and next increments
1. **R2-I:** Complete editable-creative and source-evidence simulation; use existing CreativeAsset/DAM owner.
2. **R2-J:** Complete consent/email simulated journey engine with immutable snapshots, unsubscribe and suppression.
3. **R3-C:** Build versioned signed agent manifests and deterministic capability test harness within canonical roster.
4. **R3-D:** Add governed MCP/model provider simulators with no network or credentials.
5. **R3-E:** Extend canonical WorkflowExecution to approved draft-version pinning and bounded durable runtime; no external effects until explicitly authorized.
6. **R2/R3 acceptance:** 500-case test matrix, two-tenant/agency revocation, failure injection, UI E2E, full CI, no live account connection.

Do not report R2 or R3 as complete until every acceptance gate has evidence. Production external integrations remain locked by design.
