# R3-I — Governed Agent Memory, Knowledge Graph & Retrieval Evaluation

**19 November 2026.** A real offline engineering tranche, **not full R3 production certification**. No real provider accounts, external models, connectors, autonomous learning or publishing were enabled.

## Mandatory Reuse Map
| Business concept | Authoritative owner already in repo | R3-I reuse/extension |
|---|---|---|
| Document provenance/review | `MarketingLearningService`, `KnowledgeDocument`, `KnowledgeChunk` | Reviewed source IDs are the ONLY graph nodes and memory anchors; no parallel documents, embeddings or source store |
| Agent identity/capability | `AGENT_ROSTER`, `AgentService`, signed agent releases | One agent ID in canonical roster per memory; no new agent identity or capability |
| Agent brain/flow | `BrainRunExecutorService`, `BrainRunLedgerService` | Extend existing per-agent knowledge context, never a second agent runtime/ledger |
| Knowledge governance | `MarketingLearningService` | One subordinate relation collection and one subordinate source-backed memory collection, managed via existing service and OIDC |
| Agent skills | `LearningSignal`, `AgentSkillProposal`, `SkillReleaseService` | No automatic skill promotion, fine-tuning or preference training. Reviewed feedback only informs human decisions |
| Human authority | OIDC User, marketing permission registry | Admin proposal and different admin review, source ACL, TTL, source revocation |
| Review/audit | `AuditEvent`, `OutboxEvent` | Human relevance feedback and retrieval evaluations stored as existing audit events, not another feedback learning engine |

## Implemented

1. **Knowledge graph built from existing reviewed source nodes.** `KnowledgeRelation` links two existing `KnowledgeDocument` IDs in the same tenant (composite FK), classified only as SHARES_TOPIC, METHODOLOGICALLY_RELATED or REPORTS_CONFLICT. These are **reviewed source relationships, not scientifically verified facts.** A human administrator proposes, another approves. Immutable edge/note digest, terminal revocation and note scrubbing; PostgreSQL FORCE RLS and maker-checker triggers.
2. **Agent-scoped, short-lived memory.** `AgentKnowledgeMemory` is a human-authored, human-approved, immutable, source-cited 40–1200-character statement for exactly one canonical agent, anchored to a REVIEWED source with `AGENT_SCOPED` access. Expiry no more than 30 days and never later than source expiry. Re-review is necessary for changes. No autonomous write path. PostgreSQL admission and independent approval guards; FORCE RLS. Revocation scrubs active memory content while retaining digests/audit.
3. **Transactional context retrieval.** Existing `contextForAgent()` now obtains local sparse/full-text citations, active scoped memory and directly connected reviewed graph metadata in one tenant-isolated serializable transaction. Both endpoints of a graph relationship must independently grant the querying agent access. Human-only documents are never silently exposed through a graph edge. Memory is never presented as verified scientific truth.
4. **Safe existing brain handoff.** `BrainRunExecutorService` continues the canonical agent execution path. Agent memory is appended as untrusted source data with memory citations and TTL, not as system instructions; all memory excerpts are masked when remote model reasoning is enabled. No external model calls or tool accounts are activated.
5. **Revocation cascade.** Revoking a source atomically scrubs its chunks, revokes and scrubs dependent agent memory and graph relations, revokes linked learning signals, and withdraws dependent skill proposals. The existing AuditEvent/OutboxEvent records the action. **Historical AgentExecution inputs, logs, exports and backups are NOT automatically erased**; they require separate retention/governance.
6. **Human relevance feedback without silent tuning.** Authorized reviewers record a RELEVANT, IRRELEVANT or MISLEADING label only against an existing reviewed unexpired chunk. Only SHA256 of the query is stored in audit, not the raw query, and no automatic ranking weights, memories, agent skills or models are changed. Read-only summaries are aggregated from existing AuditEvent.
7. **Bounded retrieval evaluation.** One to twelve operator-labeled cases with 1–5 expected reviewed tenant-owned sources each, cutoff 1–10. Measures precision@K, recall@K, MRR, NDCG@K and hit rate from actual existing retrieval, with audit-only snapshot. Label set is **operator judgment**, not independent verification or production benchmark certification. No promotion, automatic retraining or provider calls.
8. **Operator UX and authorization.** Adds an R3-I console to the existing command center for proposing/reviewing graph relationships, proposing/reviewing/revoking scoped memories, recording feedback and evaluating retrieval. All routes use existing OIDC, marketing permissions and strict Next BFF allowlist; no generic tool execution endpoint.

## API (all tenant-scoped)
- `POST /marketing/learning/graph`, `GET /marketing/learning/graph/:id`, `POST /marketing/learning/graph/:id/review`, `.../:id/revoke`
- `GET /marketing/learning/memories`, `POST /marketing/learning/memories`, `POST /marketing/learning/memories/:id/review`, `.../:id/revoke`
- `POST /marketing/learning/knowledge/feedback`, `GET /marketing/learning/knowledge/feedback`, `POST /marketing/learning/knowledge/evaluate`

## Validation and limitations
Unit tests cover deterministic quality metrics, unique reference labels, duplicate/oversize rejection and query hashing. PostgreSQL integration exercises real reviewed source nodes, independent OIDC approvals, per-agent graph ACL, memory TTL/provenance, no-model context retrieval, feedback, evaluation, revocation cascade, immutable content enforcement, cross-tenant FORCE RLS and zero provider model usage. Repository CI must additionally pass TypeScript, Prisma clean/historical migration/diff, regression suite, build and SBOM evidence.

**Still pending R3 acceptance**: neural semantic vector retrieval and large-recall evaluations, inference prompt-injection red teaming, graph contradiction resolution and scientifically verified claims, user/agency object-scoped ACL, durable legal retention/deletion across backups and execution logs, full time/event DAG operations, distributed execution DR, 500-case independent E2E suite and penetration testing.

Do not connect any real provider/account before engineering and production readiness have been explicitly approved.
