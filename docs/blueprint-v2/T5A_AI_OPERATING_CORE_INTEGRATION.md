# T5A — Integrated governed AI operating core, offline contract tranche

**Status:** Candidate engineering change pending GitHub CI. It does **not** certify all R3, Master Blueprint v2.1, real providers, independent security or production use.

## Reuse Map — one authoritative owner per concept

| Requested domain | Authoritative existing owner | T5A integration, without duplicates |
|---|---|---|
| Agent Studio, 13 canonical agents, signed releases | `AgentService`, `AGENT_ROSTER`, `AgentManifestRevision`, `AgentReleaseStudio` | Reuse roster and signed capability/review restrictions; no new agent identity |
| Workflow Studio | `MarketingWorkflowService`, `WorkflowExecution`, `WorkflowStepExecution`, `WorkflowLeaseService`, `OfflineDagStudio` | Accept a safe *unsigned draft* from Blueprint Studio only; exact human gates and signer checks remain server owned |
| Blueprint Studio | `@medsol/contracts` virtual compiler/simulator and `BlueprintVirtualStudio` | Strict conversion to existing deterministic offline DAG manifest; disallow silent removal of unsupported effects |
| Multi-model gateway | `GovernedModelService`, `BoundedModelGateway`, `GovernedModelRouter`, `ModelBudgetService` | Opt-in **server-configured simulation-only** exact-tenant/agent routes; no fallback to a different tenant or global route |
| MCP/A2A governance | `GovernedToolRegistryService`, `GovernedToolRegistration`, `inspectToolInvocation` | Inspection withdraws the approved metadata claim if signer trust or stored manifest digest fails; network still locked |
| Deep knowledge and memory | `MarketingLearningService`, `KnowledgeDocument`, `AgentKnowledgeMemory`, `KnowledgeRelation` | Reuse reviewed-source permissions, TTL/revocation; no new memory or RAG store |
| Learning/retrieval evaluation | `MarketingLearningService`, `evaluationMetrics`, `SkillReleaseService` | Reject duplicate ranked source IDs or case IDs that would inflate Recall@K/NDCG and mislead skill evidence |
| IAM/audit | Existing OIDC tenant context, `ApprovalService`, `AuditEvent`, `OutboxEvent` | No bypass, no shadow approval/signature store, no new business table |

## Actual implementation

### Exact-tenant model route simulation
The existing provider-neutral router now supports explicit `EXACT_TENANT` mode. Every route must name a fixed organization, canonical agent, exact purpose and configured provider. Unknown tenant, unknown agent, purpose mismatch, duplicate routes and global fallback are refused; no retry after ambiguous provider result.

`MARKETING_MODEL_PROVIDER=simulation` plus optional `MARKETING_SIMULATED_MODEL_TENANT_ROUTES_JSON` accepts a **trusted environment-only** JSON map, for example:
```json
{
  "tenant-a": {"MKT-CMO-001": "ANTHROPIC"},
  "tenant-b": {"MKT-CMO-001": "GEMINI"}
}
```
Only 20 tenant entries, 13 declared agents per tenant and 100 routes total are allowed. If the variable is unset, existing server-global simulation configuration remains unchanged. This is *not* tenant BYOK, actual provider routing, or billing reconciliation. The gateway and budget ledger remain authoritative.

### Blueprint Studio → Workflow Studio
A valid virtual Blueprint simulation can be explicitly transferred to the existing Workflow Studio. The handoff preserves the graph but only supports the existing signed offline deterministic subset. Any SCHEDULE, EVENT_WAIT, MCP_TOOL, A2A_TASK, DOMAIN_COMMAND, unsupported clock/effect node, excessive agent time or human-review bypass causes a visible error. No graph node is silently removed; no signature is generated, no release is authorized. The receiving studio clears stale signature, selected run and request-key state and uses the current identity's tenant scope. All actual releases require a separately trusted signer, independent human approval and activation in `MarketingWorkflowService`.

### Knowledge, memory, learning integrity
The existing `MarketingLearningService` remains sole source/review/revocation authority. The retrieval evaluation helper now requires distinct, bounded ranked document IDs, distinct expected sources and case IDs before computing quality metrics. This closes a path for repeated rank positions to overstate Recall@K or downstream quality evidence. No skills are automatically released.

### MCP/A2A registry integrity
An APPROVED database status no longer causes the inspection response to claim approved metadata if the server-trusted Ed25519 key is removed/rotated or the canonical digest mismatches. Both paths remain network-disabled; signature/digest loss does not approve tools or external execution.

## Required acceptance
- Full TypeScript, unit tests, signed model routing tests, MCP PostgreSQL signer-rotation tests, browser + real-stack acceptance, 46-table RLS census, 500-slot **unsigned** operator handoff, security/SBOM and build.
- No paid model calls, real social/email, external tools, provider accounts or user-managed credentials in this phase.
- All CI evidence records actual run/commit; any failure must be corrected before PR merge.

## Remaining Master Blueprint R3 depth (not completed by this tranche)
True customer BYOK credential custody, provider/model capability and regional policy enforcement, validated official API behavior and billing reconciliation; remote MCP/A2A transport with DNS pinning, SSRF controls, schema-validating quarantined output and actual revoked-grant fencing; production-scale neural retrieval, durable privacy/retention/erasure, model-enabled RAG red-teaming and skill quality rollout; expanded execution node support (approved time/event waits, compensations and real concurrency), tenant/agency per-resource ACL, distribution/load acceptance; persistent staging and independent 500-case security/UAT certification.

**Never equate an offline adapter, approved registry record, virtual blueprint, local retrieval metric or signed draft with commercial production readiness.**
