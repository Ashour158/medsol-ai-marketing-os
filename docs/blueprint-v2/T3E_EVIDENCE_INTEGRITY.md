# T3E — Fail-closed evidence integrity for signed offline agent workflows

## Reuse Map
- **Authority for reviewed source and memory:** existing `MarketingLearningService` and PostgreSQL RLS-backed `KnowledgeDocument`, `KnowledgeChunk`, `AgentKnowledgeMemory`.
- **Signed DAG authority:** existing `MarketingWorkflowService` and `ApprovalService`; no new workflow engine, data store, approval authority, or API.
- **Evidence boundary:** existing `r3g-dag-evidence.ts` and deterministic `agent-content-firewall.ts`; no AI model calls or external providers.
- **Testing:** existing Vitest unit tests and full CI real-stack Chromium tests.

## Changes
1. Knowledge-required signed DAGs reject retrieval with **zero reviewed citations** instead of accepting an empty citation list. Existing DAGs pinned to `DISABLED` remain unchanged.
2. Validate **every retrieved source and memory candidate** for provenance, safety, expiry, digest and scope before limiting excerpts sent to an agent. An unsafe third result or fifth memory can no longer disappear through truncation.
3. Source and memory citation identifiers must match the pinned content digest. Duplicate citation references and repeated source/memory IDs fail closed.
4. Every subsequent approval/tick/checkpoint already calls `assertDagEvidenceCurrent`; it now rejects an empty or duplicate reference set as malformed.

## Boundaries
This is a targeted safety-hardening tranche, **not** a completed RAG engine, model evaluation certification, independent red team, privacy deletion, persistent staging or production release. No real AI, social, or email providers were connected. Production remains `NOT_CERTIFIED`.
