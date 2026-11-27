# Creative production expansion — OpenMotion-first selective adoption

**Approved product direction:** expand existing Creative & Brief Studio (S04), E10–E14/E32 and WF06/WF19/WF07, with dependencies on E02/E05/E23–E28 and existing campaign, delivery and analytics owners. No new engine/studio/agent ID; no independent business write authority. **Target scope, not delivered implementation.** Tranche 1 remains open; PR #154 persistent local video was open at the inspected main baseline `8e11db5b1ee02ba5cdca19ec4f6fd7ed1456e719`. No real accounts, cloud subscriptions, vendor calls or paid hosting authorized.

## Upstream evidence and disposition

| Candidate | Pinned revision | Declared repository license | Decision |
|---|---|---|---|
| [OpenMotion](https://github.com/nexu-io/openmotion) | b6846fda08c4950fe4d50e5b01225bd49f84167b | Apache-2.0 | First-choice motion editor/render evaluation; selectively adapt, do not fork SaaS authority |
| [BeatDesign](https://github.com/BeatAPI/BeatDesign) | 174e652451a3533c20462acb7380008428670ff6 | Apache-2.0 | Evaluate creative canvas and MCP UI; avoid overlapping timeline |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | e668010778568641babef2cc40be4703ae6916d6 | MIT | Alternative footage-editing/timeline components if justified |
| [Tela](https://github.com/heyimjames/tela) | 7d46c2640c9cbf303676a809f465ae344722508d | MIT | Evaluate embeddable still canvas |
| [Canvix](https://github.com/mir-ashiq/canvix) | 50a4fe5a44c56fb7939e91338ae920a22d6a81ce | MIT | Compare still editor before selecting one |
| [Open AI Design Agent](https://github.com/Anil-matcha/Open-AI-Design-Agent) | f029d0d708d8c581463f018cdc2b0084494ce401 | MIT | Review inert planning patterns; no parallel agent |
| [OpenDesign (clawnify)](https://github.com/clawnify/OpenDesign) | 1219485b131d8d03589bb5ce7c43f86ee6faa84e | MIT | Compare template/design utilities; distinct from nexu-io OpenDesign |
| [Penpot](https://github.com/penpot/penpot) | 28f63af16e14ae26c51c2e18225180de432af1fb | MPL-2.0 | Separate adapter or file-level compliance review |
| [NodeTool](https://github.com/nodetool-ai/nodetool) | 78e1ee52843e5d8fd936ed719e2e54976cf22454 | AGPL-3.0 | Architecture reference only pending legal review |
| [Postmill](https://github.com/postmill-ai/postmill-app) | 6bbea6f33c6e397b7b225c7c2282f0f56089e400 | AGPL-3.0 | Architecture reference only pending legal review |

Repository metadata licenses are not clearance of individual files or dependency trees. No upstream code imported or executed. Pin exact source and dependency lock, preserve copyright/NOTICE, inspect transitive and bundled licenses, font/media rights and patent/codec obligations. No automatic acquisition of reference videos or redistribution of reference/template assets.

## OpenMotion source audit

Pinned [architecture](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/docs/product/architecture.md), [package manifest](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/package.json), [worker](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/src/workers/render-export.ts), [render environment](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/src/workers/render-env.ts), [export authority](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/src/services/export-service.ts), [MCP dispatcher](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/src/mcp/tool-dispatcher.ts), [model gateway](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/src/services/model-gateway.ts), [Motion.md package](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/packages/motion-package/README.md), [deployment](https://github.com/nexu-io/openmotion/blob/b6846fda08c4950fe4d50e5b01225bd49f84167b/deploy/README.md).

- HyperFrames 0.9.7, Chromium and FFmpeg, React/Vite editor, Node/Hono API, PostgreSQL/Drizzle, BullMQ/Redis and S3 CAS; current deployment uses Node 26.11.1 and recommends 8 GiB development RAM for 1080p export. Evaluate exact runtime and codecs in isolated worker, not in Next/Nest process.
- Real source implements immutable export snapshots, expected revision/request ID, job status/cancellation and output verification. Render environment allowlist is useful defense in depth, not proof of sandbox isolation.
- Motion Package v0.2 draft has hash inventory and explicit manifest; no general automatic Motion.md parser or cross-engine execution guarantee. Treat Markdown/skills as quarantined data, never instructions with inherited authority.
- Cloud Phase 1 provides motion editor, asset/generation/export and MCP paths; Design Studio, Brand Kit, workflows, local agents and ASR/review features are explicitly deferred or hidden in cloud P1. Do not claim all features available in deployed cloud. Mock mode exists; paid/live OpenDesign gateway must remain disconnected.
- OpenMotion root is Apache-2.0; its HyperFrames fork, GSAP, media, fonts and separately licensed assets require file-level checks. Do not wholesale import its DB, billing, auth, OAuth/PAT, agent/model gateways, skill runner or template corpus.

## Mandatory implementation packages (dependency order)

| Package | Existing target IDs | Acceptance |
|---|---|---|
| C0 source/security/license selection | E26/E28/E14 | Pinned candidate bill of materials, license/NOTICE and dependency scan; compare one still editor and one timeline; no uncontrolled install or external requests |
| C1 canonical creative contract | E10/E11/E14/E32 WF06/WF19 | Brief, concept, copy variants, source revision, scene/layer/media references, rights, format, timeline, caption and audio track; schema rejects unknown/remote execution fields; exact tenant/brand and revision |
| C2 reference and brand intelligence | E02/E05/E13/E32 | Permissioned reference input with provenance, shot/timing analysis, approved brand/claim snapshot, template and Motion.md import as inert reviewed data; no unlicensed reference copying |
| C3 editable graphic workspace | E10–E14 S04 | Infinite canvas, text/image/vector layers, brand kits as projections, templates, undo/redo, autosave, optimistic edits, multilingual/RTL, controlled image editing and exact export; human and agent edit same canonical source |
| C4 isolated motion renderer | E11/E14 E26 WF06 | OpenMotion/HyperFrames candidate POC, no-network sandbox, no credentials, pinned content snapshot, bounded CPU/memory/time/media dimensions; actual decoded MP4/WebM, timeline/scene/transition/overlay and cancellation/retry/readback tests; retain current offline fallback |
| C5 multimodal media and audio | E11/E27/E28 | Image generation/editing, video generation, voiceover, subtitle and audio mix via existing model/tool gateway; mock adapters for all, approved local fixtures, licensed audio/voices, no provider keys; exact generated output provenance |
| C6 agent and collaboration | E23/E24/E32 | Existing Creative Director, Content, Brand and Scientific roles coordinate designer/video/audio capabilities using signed workflow; bounded loops; preview/revise, distinct human review; no new agent IDs |
| C7 quality and campaign handoff | E13/E14/E25 WF07/WF08 | Independent decode and byte hash, frame/audio inspection, claim/translation/accessibility/rights review, current exact approval; campaign variants per channel, no publishing without existing release gate |
| C8 evaluated creative memory | E05/E23/E20 | Quarantined feedback and source-linked outcomes, human-approved skill release, canary and rollback; no automatic learning of confidential assets or causal claims |
| C9 consolidated acceptance | E26/S04 | Two tenants, revoked agency, tampered source/ZIP/SSRF/path traversal/HTML script/secret-exfiltration denial, stale revision, duplicate jobs, crash/cancel/unknown result, real local render and browser round trip, accessibility/RTL, SBOM and unsigned engineering evidence. Independent release gates unchanged. |

## Reuse map and hard boundaries

CreativeAssetService/CreativeAssetRevision own creative source and renditions; VerifiedMediaEvidenceService owns byte observations; ApprovalService owns independent decisions; BrandMasterService and reviewed knowledge own facts/rules; CampaignService owns campaign/variant association; MarketingWorkflowService/BrainRunLedgerService own orchestration; GovernedModelService/ModelBudgetService own provider and cost; existing MCP registry owns tool allowlisting; MarketingLearningService owns skill feedback; MarketingPerformanceService owns outcome observations. Preserve existing tenant RLS and role permissions. A renderer accepts an immutable scoped work order, produces output and verification evidence; it cannot approve, publish, access business databases or hold provider secrets. Any sidecar storage is technical derived content, not competing DAM ownership.

Reject arbitrary executable imported HTML in the app origin. Render in isolated ephemeral process/container with network deny, sanitized file inventory, no host mounts, browser sandbox, cgroup quotas and explicit timeouts; capture exact source/output digests and decoder evidence. Never interpret mock receipts or header inspection as decoded or licensed release. Provider calls, social posting, real customer communications and cost-incurring generation remain default-denied. No new dependencies or runtime behavior in this amendment.
