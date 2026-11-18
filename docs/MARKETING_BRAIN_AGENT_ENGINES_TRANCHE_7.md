# Tranche 7 — Marketing Brain, 13 Agent Engines & Nervous System

## Implemented
1. **Agent roster completeness:** all 13 official manifests now have registered runtime implementations. Five existing specialized agents (CMO, Strategy, Analytics, Brand, Scientific) are retained for backward compatibility; eight missing agents use the new deterministic domain-engine framework.
2. **Engine contract:** the new engines produce structured proposals with a domain action, evidence references, explicit human-review conditions, missing controls and next-agent handoffs. They do not claim evidence is verified, do not write domain records and do not publish.
3. **Brain:** `marketing-brain.ts` defines five stages: Strategy, Planning, Production, Governance and Measurement. The plan validates that each of 13 agents appears exactly once and handoffs reference known agents.
4. **Nervous system:** explicit directional handoff graph across CMO, Operations, Strategy, Analytics, Product Marketing, Growth, CRM, Content, Social, Creative, Brand, Events and Scientific Compliance.
5. **Control plane:** manifest capability checks, per-execution grants, tenant/correlation identity, input/output limits, risk policy, scientific-evidence missing flags, brand-master version flag, CRM consent flag and human review gates.
6. **Orchestration:** `MarketingBrainService.assess` invokes the 13 agents in ordered stages with a common tenant/correlation and causation chain; `AgentService` persists each execution in the authoritative agent ledger. It returns `REVIEW_REQUIRED`, never silently releases external actions.
7. **Authenticated API:** `GET /marketing/brain/plan` (READ_AUDIT) and `POST /marketing/brain/assess` (EXECUTE_WORKFLOW). The tenant is overwritten with the verified OIDC identity in the API controller. The Next.js proxy only allows these exact paths with an authenticated session and same-origin POST.
8. **Tests:** roster coverage, handoff integrity, execution grants, scientific claim safety, publishing block, causal trace, and role-based access.

## Authority and maturity notes
- **These are initial deterministic engines**, not fully autonomous production intelligence. They currently draft structured plans and control decisions; they do not perform real market research, connect CRM/ERP/social tools, evaluate clinical evidence, render creative assets or perform genuine analytics on authoritative data.
- Existing five specialized agents still use their earlier simplified decision logic; unified domain-engine semantics across all 13 and versioned engine plugins are future work.
- The brain's `assess` endpoint is a synchronous proposal-generation route. It is not yet a durable, resumable 13-agent saga. A failure partway through leaves completed agent executions in the ledger for investigation; automatic replay must be designed with idempotency and step-level fencing.
- Agent handoff graph is declarative. It does not automatically dispatch cross-agent events or bypass workflow approval gates.
- The control plane currently uses caller-supplied capabilities only from server-side orchestration. Never expose capability grants as untrusted client parameters.
- Existing provider model gateway remains disabled. Live model inference, retrieval, citation verification, immutable price books and production connector execution are not enabled.
- Microsoft Entra staging environment remains deferred, with production auth controls intact.

## Required next tranches
1. Unified agent engine interface for all 13, domain-specific data schemas, source provenance, model/retrieval adapters and evaluation suites.
2. Durable brain-run ledger, idempotent per-agent tasks, bounded worker dispatch, execution leases, retries and operator recovery.
3. Actual authority-owned adapters for portfolio, campaign, analytics, CRM and brand/evidence sources; tool permission scopes and audit trails.
4. Versioned policy and approval graph (scientific -> brand -> marketing -> legal where applicable), with explicit publish authority.
5. Full command-center UI for brain graph, agent health, intervention queue, traces, evidence and cost.
