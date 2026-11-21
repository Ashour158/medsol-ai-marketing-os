# T3D — Reviewed knowledge and memory in signed offline DAG agent execution

**Scope:** 21 November 2026. Engineering only; no hosted staging, external providers or production certification.

## Mandatory Reuse Map
| Business concept | Existing authoritative owner reused | Addition |
|---|---|---|
| Knowledge, chunks, memory, revocation | `MarketingLearningService` and its FORCE-RLS `KnowledgeDocument`, `KnowledgeChunk` and `AgentKnowledgeMemory` | Only existing `contextForAgent` reads; no new index/knowledge/learning store |
| Signed workflow runtime | `MarketingWorkflowService`, `WorkflowExecution` and `WorkflowStepExecution` | Explicit launch-pinned knowledge mode, bounded cited context and source-reference verification within existing lease/fence transaction |
| Human release | `ApprovalService` / canonical `Approval` | Recheck cited source after agent checkpoint before independent approval; no duplicate reviewer |
| Canonical agent execution | `AgentService` and 13-agent roster | Untrusted reviewed context attached as data; no new agent, model, tool, external effect |
| Authentication and isolation | Existing OIDC, tenant guard and PostgreSQL FORCE RLS | Signed operators, cross-agent ACL checks, no client-supplied evidence |
| QA | GitHub Actions actual compiled Next/Nest/PostgreSQL | Disposable RSA OIDC and ephemeral Ed25519 release signatures, no paid hosting |

## Technical contract
- Explicit `MARKETING_DAG_KNOWLEDGE_ENABLED=true` at launch pins `knowledgeMode=CITATIONS_REQUIRED` in the canonical workflow input. Existing signed DAGs with knowledge disabled remain unchanged; the flag cannot be used to silently escalate a running older DAG.
- At each `AGENT_TASK`, call the existing `MarketingLearningService.contextForAgent(tenant,canonicalAgentId,objective)`. Strict provenance, review, expiry, source scope and deterministic content firewall checks yield at most two 240-character reviewed source snippets plus four 240-character reviewed memory notes.
- Knowledge is explicitly `untrustedDataNotInstructions`; never verified scientific truth. It may not become a system instruction, model call, tool execution, memory write or content approval. The existing AgentService still persists bounded source excerpts in AgentExecution.input; **source revocation does not erase old execution history**. Production retention/erasure acceptance remains pending.
- Agent checkpoint commits only if referenced source/chunk/memory still REVIEWED/APPROVED, unexpired, digest-pinned, and scoped to that agent, in the existing tenant transaction. It records immutable evidence identifiers in the canonical WorkflowStepExecution output and audit event.
- Independent workflow approval revalidates all completed agent citation references using the canonical ApprovalService transaction. Revoked sources make approval fail rather than launder untrusted intelligence into a release.
- Every later tick rechecks completed evidence; revoked evidence blocks the workflow with `CITED_KNOWLEDGE_INVALIDATED` and no replay.
- The entire pathway is deterministic and OFFLINE. `MARKETING_AI_REASONING_ENABLED=true` remains incompatible with signed offline DAG execution.

## Acceptance
Unit tests probe malformed provenance, injected instructions, expired sources, forged digests, revoked documents and memory, and cross-scope source checks. Three real-stack signed Chromium journeys validate approved source-use, source revocation before independent review, and source revocation after approval before DAG continuation.

**Remaining:** independent QA, full retention/right-to-erasure, prompt-injection red team, model-enabled RAG certification, neural search quality, paid/provider integration and persistent staging. Production release is NOT_CERTIFIED.
