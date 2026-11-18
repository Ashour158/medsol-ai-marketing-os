# Phase 3 — Social discussion and retrieval-evaluator evidence

## Reuse Map
- `MKT-SOC-001` remains the single authoritative agent for social discussion classification. The pure, deterministic `triageSocialDiscussion` function is called **only by** the existing `engineDecision` for this agent; no database table, channel connector, responder, queue, or standalone service was created.
- `AgentRuntime` remains the mandatory policy boundary. It now keeps a stricter agent-owned human approval requirement even when the generic risk policy would not require approval.
- `ScientificLiteratureConnector` remains the Europe PMC metadata discovery owner. Its bounded lexical ranking uses existing, already-retrieved metadata, not a second search provider or a RAG stack.
- `MarketingLearningService` retains quarantine authority for all ingested metadata. Source text is untrusted and never becomes independently verified by ranking.
- `.github/workflows/ci.yml` is still the sole CI workflow owner; attached SBOM/audit artifacts are produced by its existing `security-evidence` job.

## Implemented, with executable test evidence
1. Social discussion triage covers INFORMATIONAL, ANSWERED, NO_RESPONSE and HUMAN_REVIEW_REQUIRED with 20 synthetic golden cases. A reply can be marked ANSWERED only when an internal reviewed answer reference is supplied; even then scientific correctness is **not verified**.
2. Clinical and treatment discussion goes to scientific review, claims about FDA approval and regulated certification to brand review, and patient records/private-data discussion to privacy review. Escalations override apparent spam or previously answered status. Keywords are conservative deterministic screening, not validated comprehensive adverse-event detection.
3. All classifications are internal recommendations. `humanApprovalRequired=true`, `externalEffectsAuthorized=false`; an untrusted input cannot publish or delete a social message. The central runtime retains stricter agent approval after policy evaluation.
4. Lexical Europe PMC metadata ordering is evaluated on a fixed five-scenario reference set, including tie stability and unwanted prompt-like text. Ranking matches query tokens in title and abstract; it is NOT a RAG retriever, a clinical literature quality score, or an external scientific fact checker.
5. The CI failure corpus records actual failed GitHub run evidence with reproduction commands, required blocking actions and resolution guidance.
6. Security evidence is indexed under `docs/security/SBOM_AND_AUDIT_EVIDENCE.md` with actual artifact links, expiry and unresolved advisory disclosure.

## Deliberately not implemented for ECC score inflation
- **PR salvage/review:** stale PR queues, thread repair and reopen flows are developer-repository automation, not a Medsol marketing domain. Creating them would violate business authority boundaries.
- **Cross-harness support:** Claude, Codex, OpenCode, Zed, dmux are not supported runtime providers and continue to fail closed.
- **Full retrieval-augmented generation:** no vector index, multi-document grounding, long-form retriever or semantic ranking service has been claimed.
- **Autonomous social activity:** no social platform credentials, third-party publication API, customer messaging or moderation-deletion permission is enabled.

## Production gates
Require expert-labelled real-world discussion evaluation, false-negative audits for patient/regulatory escalation, approved moderation handbook and retention/privacy review, consent-aware channel adapters, external claim review, authenticated identities and live staging tests before activation. This work does not authorize a production launch.
