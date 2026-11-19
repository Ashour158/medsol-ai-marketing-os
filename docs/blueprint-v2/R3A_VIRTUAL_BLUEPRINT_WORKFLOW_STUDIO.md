# R3-A — Authored Blueprint/Workflow simulation on canonical workflow ledger

**Delivered:** A bounded, deterministic, tenant-authenticated DAG Studio simulation that persists a step-by-step **virtual** orchestration trace in the existing WorkflowExecution and WorkflowStepExecution tables, with human audit and one internal Outbox event. It performs NO real agent inference, model billing, MCP/A2A calls, domain commands or provider delivery. This is not a workflow deployment runtime and not all R3.

## Mandatory Reuse Map

| Concept | Existing authoritative owner | This tranche |
|---|---|---|
| Canonical engines/workflows/agent IDs | @medsol/contracts target registry and @medsol/agent-runtime's 13-agent roster | The existing blueprint-v2-compiler lints references and effects; simulator reuses it and does not install shadow agents |
| Workflow execution / steps | MarketingWorkflowService + WorkflowExecution / WorkflowStepExecution | New **virtual-only** path stores completed topology simulation in the same ledger; no second workflow history |
| Lease/fencing | WorkflowLeaseService | Existing real business workflow executor unchanged; virtual DAG is evaluated atomically with no remote effects, hence no lease or partially executing worker |
| Approval/brand/campaign write authority | ApprovalService, BrandMasterService, CampaignService | Human task/approval nodes are labeled 'WOULD_WAIT_HUMAN'; never approved or mutated by simulator |
| Model/MCP/A2A | GovernedModelService / forthcoming MCP Registry and Integration Hub | All real model, tool, peer and provider calls remain zero; connector/domain command nodes fail static authorization |
| Tenant IAM | OIDC-bound active User and existing marketing permission registry | EXECUTE_WORKFLOW + exact matching organization/user/subject/role are mandatory |
| Audit/events | AuditEvent, OutboxEvent | One immutable human audit and one internal virtual-workflow event in the same serializable transaction |
| UI | Existing Command Center architecture register | Added Blueprint & Workflow virtual Studio with editable JSON, safe sample graph, ordered trace, output reasons and replay |

## Capability

- Accepts the blueprint's 17-node taxonomy through the existing static compiler, but refuses unsupported DOMAIN_COMMAND, MCP_TOOL or A2A_TASK, unbounded loops, nonzero external effects, cycles, unknown agents/engines and unsupported graph wiring. It does not misrepresent connector-incompatible nodes as simulated success.
- Valid topology requires exactly one TRIGGER, every node reachable, reachable END and topological ordering with deterministic lexical tie-breaks. Maximum 100 nodes and 200 edges remain inherited from the compiler.
- Traces virtual agent tasks, human decisions, schedule/event waits, parallel/join predecessor ordering and bounded-loop design without claiming any action occurred.
- Returns zero actual agent executions, model calls, MCP/A2A requests, domain writes and external effects, and always `executable:false`, `deployAuthorized:false`.
- An authorized tenant operator can persist a completed simulation. Source snapshot SHA-256 and a domain-separated tenant/user/requestKey fingerprint fence idempotency. Unique partial SQL index on existing WorkflowExecution prevents duplicate accepted claims. Same key and same source replays; key reuse with a changed graph conflicts.
- A single serializable PostgreSQL transaction creates WorkflowExecution(COMPLETED), step records, audit and an internal event. Invalid/unsafe graphs are blocked without creating a durable accepted workflow. Unlike real workflow execution, there are no in-flight side effects to recover.
- API is `POST /marketing/architecture/blueprint/simulate` under EXECUTE_WORKFLOW, through existing Next BFF and OIDC guard. `POST .../deploy` remains unsupported. Operators can inspect graph history through the canonical workflow ledger, not a parallel simulator store.

## Tests

- Contracts unit tests for deterministic fan-out/join, approved agent aliases, human/schedule boundaries and 0 external actions.
- Reject unbounded loops, unsafe side-effect declarations, cycles, hidden orphan nodes, duplicate triggers, unknown agent identities, MCP/A2A/domain tool nodes.
- Real PostgreSQL test creates two tenants and a verified OIDC admin: persisted 9-step virtual workflow, no AgentExecution/ModelUsage, exactly one audit/outbox, same-key replay, conflicting-version rejection, tenant/subject/role denial, invalid graph not persisted.
- CI clean and historical migration, TypeScript, API/contracts/web tests/build, security evidence and SBOM required before merging.

## Remaining R3 acceptance

This tranche is the **authoring and simulation spine**, not a production graph executor. Outstanding R3 includes:
- Agent Studio signed versioned deep manifests, per-agent knowledge bases, actual multi-agent collaboration, governed runtime skill evaluation and safe rollout.
- Durable typed workflow DSL, event-wait, human-task completion, retry/compensation, canonical execution with leases, approvals, timeout/cost budgets, signed deployment and rollback.
- Full multi-model OpenAI/Anthropic/Gemini adapters, pricing/availability policies, tenant BYOK, independent billing/source reconciliation.
- Governed MCP registry/gateway and A2A interactions, tool permission manifests, endpoint isolation, SSRF controls, red-team.
- Hybrid knowledge fabric (document, chunk, provenance, claim/graph, vector and lexical retrieval, RLS/ACL, freshness, deletion/retention), telemetry and production-scale abuse controls.

No real connections are required to continue building these software contracts and simulated adapters. External providers are reserved for final integration acceptance; a green virtual workflow is not product completion or real provider compatibility.
