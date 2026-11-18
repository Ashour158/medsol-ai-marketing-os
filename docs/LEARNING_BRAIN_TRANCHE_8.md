# Tranche 8 — Learning Intelligence, Agent Skill Governance & Brain Console

## Implemented
- Tenant-scoped `LearningSignal` with unique fingerprint, source URL/title, observation/publication dates, evidence summary and quarantine state.
- `MarketingLearningService.ingest` validates input, requires HTTPS source references, limits text, deduplicates and stores submitted evidence as **untrusted QUARANTINED** material. No automatic web crawling or source authentication is implied.
- Human evidence review is an atomic database update + append-only audit event. **REVIEWED does not mean factually VERIFIED**. Independent source verification remains future work.
- `AgentSkillProposal` is versioned, tenant-scoped and limited to capabilities already declared in the registered agent manifest. It is **PROPOSED**, never automatically activated; agent runtime remains code-authoritative.
- Protected API routes for learning ingestion, review, proposed skills and read-only inventory; management roles required to review or propose skills.
- Authenticated Next.js proxy allowlist and command center views for brain plan, all-agent assessment trace, evidence and skill proposals.
- Tests for deduplication, HTTPS references, quarantine enforcement, capability escalation and role restrictions.

## Architecture — learning loop
Source references (manual ingest only) -> Quarantine -> Human review + audit -> Skill proposal -> Future evaluation suite -> Future approved code/manifest release -> Agent execution -> Outcomes -> Future feedback learning.

## Release limitations
- No autonomous browsing, web crawling, scheduled trend scans, real-time social listening or verified market trend ranking.
- No automatic skill installation, runtime code mutation, model fine-tuning, self-rewriting prompts or self-escalation of capabilities.
- Skill proposal evaluation is marked NOT_RUN; no promotion path is enabled.
- Brain execution is currently synchronous, not a durable resumable saga. The 13-agent graph is a planned handoff graph; it does not yet dispatch messages autonomously.
- No authoritative portfolio/CRM/social data connectors, scientific source verification or paid model inference. Provider remains disabled.
- The dashboard currently displays read-only learning lists and brain traces; evidence ingestion/review/proposals are API operations with role gates.
- Existing scientific/brand/human approval requirements and production auth stay in force; Entra configuration remains deferred.

## Next critical build
1. Verified trend-source connectors, source reputation, deduplicated crawling, provenance hashes and citation validation.
2. Domain-specific agent retrieval, typed inputs/outputs and real evidence/brand rules.
3. Durable brain-run state machine with step leases, checkpoints and operator recovery.
4. Evaluation harness for proposed skills, regression datasets, shadow mode, rollout approval and rollback.
5. Human-facing evidence review, skill approval and agent health/alerts in command center.
