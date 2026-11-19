# R3-G — Signed offline DAG deployment and canonical durable runtime
**19 November 2026**  
**Status:** internal bounded engineering slice, **not production R3 certification**, no real account or external action.

## Mandatory Reuse Map

| Business concept | Existing authoritative owner | R3-G extension |
|---|---|---|
| Blueprint graph and policy | `@medsol/contracts` `lintBlueprintDraft` and `simulateBlueprintDraft` | Strict *executable subset* of existing 17-node taxonomy; never another DSL |
| Workflow runtime and steps | `MarketingWorkflowService`, `WorkflowExecution`, `WorkflowStepExecution` | Same canonical service and ledger for **BLUEPRINT_OFFLINE_DAG** runs, no shadow executor |
| Execution fencing | `WorkflowLeaseService` | Existing lease-owner + generation fencing before and after internal steps |
| Agent identity/engine | `AGENT_ROSTER`, `AgentService`, R3-F signed `AgentManifestRevision` | One bounded deterministic review action per agent; agent version pinned and checked; no new agents, no model integration |
| Human approvals | `ApprovalService`, `Approval` | Independent review recorded through canonical Approval object and callback; never a separate workflow approval decision store |
| Tenant security | OIDC User, `BootstrapAuthGuard`, permission registry | Active OIDC tenant user, independent admin release maker/checker; FORCE RLS on immutable definitions |
| Events and audit | `AuditEvent`, `OutboxEvent` | Existing audit/outbox for release/kill switch, execution summary |
| Provider/tool/model | Integration Hub, GovernedModelService, governed MCP/A2A metadata | Remain **locked**. No network, CRM, ESP, social, creative export or tool execution |

## Delivered

1. **Signed release registry:** one additive `BlueprintDeployment` table for immutable definitions, revision, digest, Ed25519 signature, trusted signer key ID, maker/checker decision, active/superseded/terminal revoked statuses. At most one ACTIVE release per tenant+blueprint enforced by PostgreSQL unique partial index. All rows FORCE RLS with real low-privileged cross-tenant probe.
2. **Governed deployment and rollback:** version N+1 only; separate signed proposal, different active OIDC ADMIN reviewer, explicit activate with expected active revision (CAS); activation of SUPERSEDED is auditable rollback. Permanent revocation is kill switch for future starts/ticks. No deploy is allowed from merely valid draft, and no signature means no activation.
3. **Canary:** signed immutable 1–100% percentage and deterministic tenant+blueprint+request-key assignment. A nonselected launch returns CANARY_NOT_SELECTED without creating execution. This is deterministic cohort routing, **not** provider-traffic canary.
4. **Real internal workflow orchestration:** stores all nodes as PENDING in existing `WorkflowStepExecution` and progression in existing `WorkflowExecution`. TRIGGER/PARALLEL/JOIN/END are completed as real internal control transitions, with join requiring all predecessor steps. Executes at most eight `AGENT_TASK` nodes (canonical `AgentService.execute`, deterministic no-model only), never retries an in-flight or unknown internal outcome. All persisted in canonical AgentExecution.
5. **Durable human waits:** HUMAN_TASK and APPROVAL nodes create `Approval` via the existing ApprovalService authority with exact pinned deployment digest and step reference, distinct maker/checker decision, independent OIDC role and transactional reconciliation. Rejection BLOCKS; approval reopens RUNNING for explicit next tick.
6. **Crash safety and bounded ticks:** canonical `WorkflowLeaseService` fencing, at most 20 steps/tick, prior RUNNING/OUTCOME_UNKNOWN blocks rather than automatic replay. No arbitrary timer, external event, side effect, connector, nontrivial transform, domain command or nested loop accepted. `MARKETING_DAG_OFFLINE_EXECUTION_ENABLED=true` must be explicitly set. When remote model reasoning is enabled, even offline DAG launch/tick fails closed.
7. **Pinned read-only review:** the run input persists release ID/digest/revision and each referenced agent's active version; each dispatch rejects changed agent version. No external effects are ever authorized by the signed graph or its approval.
8. **Security API:** exact `/marketing/architecture/deployments` propose/list/approve/activate/revoke and `/marketing/architecture/runs` launch/tick endpoints; the same Next BFF and OIDC permissions reject unsupported paths. Existing `GET /marketing/workflows/:id` inspects the real run.

## Signing and rollout

Release trust configured via `MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM` and `MARKETING_DAG_TRUSTED_KEY_ID`. Sign UTF-8 `medsol-r3g-dag-signature-v1\n` + `offlineDagDigest(manifest)` using a separately operated Ed25519 private key. The server does **not** accept a client-supplied public key. Missing trust configuration = deny.

A manifest has exactly:
```json
{
 "draft":{"id":"scientific-review","version":1,"nodes":[{"id":"start","type":"TRIGGER"},{"id":"scientific","type":"AGENT_TASK","agentId":"MKT-SCI-001"},{"id":"review","type":"APPROVAL"},{"id":"end","type":"END"}],"edges":[{"from":"start","to":"scientific"},{"from":"scientific","to":"review"},{"from":"review","to":"end"}]},
 "canaryPercent":100,
 "maxSteps":16,
 "executionMode":"DETERMINISTIC_NO_MODEL"
}
```

Stage/release by OIDC administrator via signed proposal; independent administrator approves and activates with `expectedActiveRevision=0` for first release. Run with request key 12–160 chars and bounded objective. Tick until WAITING_APPROVAL, authorize the existing pending Approval via canonical approval command, then tick to completion. For rollback, activate a previously SUPERSEDED release with exact current revision. For emergency stop, revoke currently ACTIVE release and set `MARKETING_DAG_OFFLINE_EXECUTION_ENABLED=false`.

## Verification / acceptance boundaries

CI includes contracts/unit regression and PostgreSQL signed deployment, independent review, exact waits, real deterministic AgentExecution, idempotent replay, model/no-tool/no-network checks, canary and rollback, tenant RLS, typecheck, clean/historical migrations, build and SBOM evidence.

**Still out of R3 exit scope:** distributed multi-worker crash drills, UI workflow designer/deployment management (API available), signed model-enabled agent work with budgets, truly parallel worker execution, time/event waits, compensating domain commands, MCP/A2A, tenant-scoped hybrid knowledge fabric, deployment canary telemetry, independent penetration testing, full 500 E2E suite and production customer UAT. These require further engineering and/or later provider credentials.

Provider accounts remain disconnected. This is a real **internal offline DAG state-machine execution** tranche, not external publishing or R3 completion.
