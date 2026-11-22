# T5B — Tenant-authenticated agent Knowledge, Memory and Graph context inspection

**Scope:** Audited, read-only operator preview of the exact existing Knowledge Fabric context; no new agent runtime, RAG store, memory author, model router, workflow ledger or approval system.

## Reuse Map
- `MarketingLearningService.contextForAgent()` remains the **single canonical agent context loader**: reviewed, nonexpired source chunks; per-agent reviewed memory; reviewed graph relations; provenance and rights filters.
- `KnowledgeDocument`, `KnowledgeChunk`, `AgentKnowledgeMemory`, `KnowledgeRelation`, `LearningSignal` and `SkillReleaseService` remain the only authoritative records.
- `BrainRunExecutorService` keeps its existing scoped context readback and zero-provider semantics; T5B does not change execution decisions or prompts.
- `knowledgeActor` + active OIDC `User` + transaction-local PostgreSQL RLS remain authorization. The read-only `READ_AUDIT` permission is required.
- The existing `MemoryGraphStudio`, Nest marketing controller and Next BFF are extended in place; no new backend service, database table or general-purpose data endpoint.

## Implementation
- `POST /marketing/learning/knowledge/agent-context-preview` with body `{agentId,query}`. Exact canonical agent IDs only, bounded query by the existing retrieval validator.
- OIDC actor check and the **same** `contextForAgent()` query execute in one tenant-fenced PostgreSQL transaction. No check-then-switch authorization window.
- Response exposes the same source citation/retrieval method, reviewed memory with source digests and expiry, and reviewed graph relations, plus explicit `inspectionOnly:true`, `realModelInvocations:0`, `mcpCalls:0`, `a2aCalls:0`, `skillPromotions:0`, `autonomousMemoryWrites:0`.
- No scientific truth claim, remote model processing, hidden tool capability, or automatic skill release.
- The existing Memory & Graph Studio permits authorized tenant admins to run a context inspection for one canonical agent using a search query, and clear the readback.
- Actual PostgreSQL integration extends `T07-025` with maker/checker source, scoped memory, graph, cross-tenant denial, forged-subject denial, unknown-agent denial and post-revocation context scrub.

## Remaining R3 release blockers
Production model-enabled prompt-injection and exfiltration testing; stronger brand/agency object-level ACL, semantic embedding retrieval with reviewed licensing/retention, bulk source ingestion and rights verification, durable erasure of historical executions/backups/exports, independently tested memory quality and skill promotion, persistent staging, independent QA and security signoff.

**NOT_CERTIFIED.** Read-only preview is not AI inference or commercial production readiness.
