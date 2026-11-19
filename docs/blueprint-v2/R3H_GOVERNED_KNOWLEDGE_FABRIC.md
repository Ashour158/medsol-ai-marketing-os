# R3-H — Governed Knowledge Fabric and Agent Learning Integration

**Date:** 19 November 2026  
**Scope:** Built-in, offline, human-governed knowledge retrieval and learning evidence linkage. **Not full R3 release certification**; no real model, data-provider or social account connections.

## Mandatory Reuse Map

| Business concept | Existing authoritative owner | R3-H addition |
|---|---|---|
| Learning signals, review and promotion | `MarketingLearningService` + `LearningSignal` | Same service now owns curated KnowledgeDocument and immutable KnowledgeChunk; reviewed source can only create a **quarantined** linked LearningSignal |
| Skill evaluation and code rollout | `SkillReleaseService`, `AgentSkillProposal`, signed manifest revisions | Recheck linked source is reviewed, unexpired and nonrevoked at evaluation/decision; never create a shadow skill engine |
| Agent identity and capability | `AGENT_ROSTER`, `AgentService` | Per-agent ACL scope, no new agent IDs or capability escalation |
| Agent orchestration and handoffs | `BrainRunExecutorService` / `BrainRunLedgerService` | Scope-filtered, cited read context in existing agent inputs; never a second execution ledger or persistent autonomous memory |
| Tenant identity | OIDC-bound User, `hasMarketingPermission` | Only active tenant ADMIN/SUPER_ADMIN may ingest or decide; distinct maker/checker. Management/auditor may search; agent access is derived internally from canonical ID |
| Evidence | Existing trend/evidence/brand authorities | Provenance URL/title/digest, chunk offsets and human-review labels; no scientific/regulatory fact-verification claim |
| Audit and events | `AuditEvent`, `OutboxEvent` | Quarantine/review/promotion/revocation audit; internal outbox on revocation |
| Web UI | Existing Marketing Command Center | Knowledge & Agent Learning Studio, strict Next BFF and API route permissions |

## Implemented

1. **Single learning-authority curated corpus:** Tenant-scoped `KnowledgeDocument` and subordinate `KnowledgeChunk`. Stable idempotent `sourceKey`, document/source SHA-256, per-chunk digest, original HTTPS source reference, date provenance, expiry, review state. Plain-text manual ingestion only; no URL fetching, remote vector calls or background crawler. 24,000-character document ceiling; 40 overlapped chunks (max 860 characters), 96-dimensional local sparse hash vectors.
2. **Independent review gate:** Documents start QUARANTINED and cannot be searched; a separate authorized administrator must REVIEW or REJECT with rationale. Reviewed does **not** mean scientific truth verified.
3. **Access-scoped hybrid retrieval:** PostgreSQL GIN full-text index and token index, bounded 250-row shortlist; cosine similarity of local deterministic signed hash features with explicit lexical/freshness blend. Scope intersects tenant, REVIEWED, unexpired and allowlisted canonical agent IDs. Reviewers-only sources never enter brain contexts. Result includes a stable `kb:<documentId>:<ordinal>:<sha-prefix>` citation, source digest, provenance URL and an explicit `independentlyVerified:false` label. This is **not neural semantic embedding retrieval**; no pgvector/provider embeddings are represented.
4. **Agent wiring:** `BrainRunExecutorService` retrieves the current agent's own scoped corpus and passes cited context as **untrusted data, not instructions**. Suppresses source excerpts entirely when model reasoning is enabled, pending separate prompt-injection and model-evaluation acceptance. No automatic memory or skill write.
5. **Governed source-to-learning promotion:** An active reviewed source with an HTTPS reference may be linked **once** to a QUARANTINED `LearningSignal`. The existing independent signal review, capability-constrained skill proposal, fixed regression tests and code release remain mandatory. Linked evidence must be unexpired and nonrevoked at later evaluation/decision. No evidence promotes itself.
6. **Revocation and erasure of the active source corpus:** Revocation scrubs indexed `KnowledgeChunk.content`, `terms` and `vector` plus title/URL. It revokes linked signals and withdraws dependent skill proposals, writes audit/outbox, and blocks new retrieval. **This does not erase all historical AgentExecution inputs, database backups, audit retention or exported copies.** Those require a separate retention/deletion review and R3 acceptance.
7. **PostgreSQL integrity:** FORCE RLS on knowledge documents/chunks, low-privilege cross-tenant tests, immutable document/source metadata and content digests, immutable review decisions, review maker/checker enforced by database triggers, scrub-only chunk updates after parent REVOKED. No delete shortcuts.
8. **Operator UI:** `KnowledgeFabricStudio` in the existing command center, supporting manual quarantine, independent decision, filtered search, learning signal linkage and source revocation.
9. **No provider accounts:** No real accounts, web scraping, external model inference, MCP execution, platform publishing, permissions bypass or automatic learning enabled.

## Security and accuracy boundaries

- Uploading an HTTPS URL does not verify or fetch its content. A reviewer attests the manual source presentation; independently verified scientific truth and rights/consent remain false.
- Local sparse vectors share token-similarity characteristics and are **not** neural embeddings or semantic search. Robust semantic/vector service and multi-format document ingestion remain future acceptance work.
- R3-H is intentionally conservative on unreviewed documents, citation density, retention, scope and total bytes.
- Content from retrieved sources is untrusted; no agent instruction or external action may be derived solely from a source excerpt.
- Revocation must block future retrieval immediately. Prior run history and backups require separately governed retention/erasure policy, not claims of full historical erasure.

## API

- `GET /marketing/learning/knowledge`: authorized reviewer/admin document list (metadata only).
- `POST /marketing/learning/knowledge`: tenant administrator manual source quarantine.
- `POST /marketing/learning/knowledge/search`: authorized human hybrid retrieval (reviewed sources only).
- `POST /marketing/learning/knowledge/:id/review`: independent reviewer decision.
- `POST /marketing/learning/knowledge/:id/promote`: reviewed-source → quarantined existing LearningSignal.
- `POST /marketing/learning/knowledge/:id/revoke`: source kill switch, active content scrubbing, linked-signal withdrawal.

Every endpoint is protected by the existing OIDC guard, marketing permission registry and BFF path allowlist.

## Acceptance status and next boundaries

Automated tests cover deterministic chunk/vector behavior and PostgreSQL tenant RLS, signed actor identity, source maker/checker, immutable content, source ACL, provenance, duplicate replay, learning linkage, revocation and safe zero-provider defaults. CI gates additionally run workspace tests, TypeScript/Prisma, clean and historical database migration rehearsals, production builds and dependency evidence.

**Still not certified:** large-scale multilingual/semantic search recall benchmarks, evaluated neural vector embeddings, document/PDF/OCR pipelines, knowledge graph and facts/claim relation store, per-user object/row ACL/agency delegation, legal holds, backup retention/erasure, production data retention policies, prompt-injection red-teams, 500-case enterprise E2E, full R3 workflow/model/MCP integration and independent penetration testing.
