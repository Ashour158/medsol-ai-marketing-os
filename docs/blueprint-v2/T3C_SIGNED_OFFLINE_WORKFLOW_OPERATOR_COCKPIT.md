# T3C — Signed offline DAG operator cockpit

**Scope (21 November 2026):** free CI/disposable-local real-stack engineering, not hosted staging, not production certification.

## Mandatory Reuse Map
| Concept | Authoritative owner | Extension |
|---|---|---|
| DAG releases and execution | Existing `MarketingWorkflowService`, `WorkflowExecution`, `WorkflowStepExecution`, `WorkflowLeaseService` | Presentation of pinned revisions and durable progress; existing propose/activate/tick APIs remain unchanged |
| Human decision | Existing `ApprovalService` + `Approval` + OIDC identity | Same existing `approvals/pending` and `approvals/decide` endpoints; no new approvals or self-review |
| Tenant identity and RLS | Existing OIDC guard, FORCE-RLS PostgreSQL and Next BFF | Inspect rejects mismatched organization, run ID, wrong workflow type, false external-effect provenance |
| Workflow editing | Existing signed OfflineDagGraphEditor and canonical compiler | No new DSL or graph execution authority |
| Agent work | Existing canonical `AgentService` | Existing bounded deterministic R3-G agent review, no model/connector egress |

## Delivered
- Workflow Studio now supports explicit lookup of an existing tenant-owned DAG run by ID, real durable step timeline, pinned revision, completed/total progress and canonical review state.
- The new read-only `readOfflineDagRun` projection fails closed for malformed graph ledger, mismatched tenant ID, unsafe effect flags, missing approval identity, inconsistent waits or false completion.
- Independent review in the same studio delegates to existing `ApprovalService`, requires an explicit 12+ character rationale and canonical pending approval association; UI blocks requesting actor, while API remains the authority for role, maker/checker and source digest.
- Real Chromium E2E acceptance is configured for signed OIDC operator sessions, compiled Nest, production Next and PostgreSQL restricted app role. An ephemeral Ed25519 trust key signs test-only releases on the GitHub runner and is not checked into source.
- Browser scenarios cover approved completion, rejected blocked workflow, foreign tenant denial, and same-tenant viewer read-only access with denial of approval and execution commands. A viewer can read an ordinary workflow ledger in the same tenant but cannot approve or execute it. Nothing sends social messages, email or AI model requests.

## Limitations and release gates
The UI has no authority to execute unsupported node types, external effects or untrusted releases. Only the seven existing R3-G deterministic node types are accepted. Human staging, persistent hosting, independent QA/pentest, real providers and production release certification remain unfinished. The T3C Chromium report is checked against exact test source and JSON report digests, the same-run non-BYPASSRLS PostgreSQL proof, and no-provider preflight; skipped/retried/missing executions cannot count as passing. No new hosting is required.
