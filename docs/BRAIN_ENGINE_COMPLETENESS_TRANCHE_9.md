# Tranche 9 — Brain Run Ledger, Engine Coverage and Skill Evaluations

## Verified starting point
GitHub Actions run #250 for Tranche 8 completed successfully. This tranche has separate CI and is not considered passing until its own run completes.

## Delivered code
- `BrainRun` and `BrainRunStep` are the authoritative tenant-scoped persistent records for a proposed 13-agent brain run and its ordered checkpoints.
- Unique `(organizationId, commandKey)` makes run creation idempotent; a concurrent unique-key race resolves to the existing run.
- Each run creates one ordered checkpoint for each of the 13 manifest agents. Read-only run listing and detail APIs are scoped to the authenticated organization.
- An internal `checkpoint` operation verifies the exact agent, tenant, correlation, completed execution and sequence before committing a step; it does not accept unverified client claims.
- All 13 registered domain-engine manifests and every declared capability are exercised in a regression test. The original five specialized implementations remain in production registration.
- `evaluateSkillCases` provides a bounded deterministic regression evaluation with per-case failures. Even a perfect result returns `eligibleForPromotion:false`: skills cannot self-install or self-grant authority.
- Web API proxy and marketing role permissions cover the new brain run endpoints.

## Critical gaps — do not misrepresent as complete
1. **Not yet a fully wired durable brain worker:** The checkpoint ledger is not yet connected to the synchronous `MarketingBrainService.assess` execution path. A background dispatcher, worker leases, idempotent agent task claims, crash recovery and approved replay still need implementation. No automatic RUNNING takeover.
2. **Not yet fully intelligent domain engines:** Eight new engines are deterministic proposal templates. Five legacy agents use simplified specialized logic. Real sector-specific research, analytics, content generation, CRM workflows and scientific claim validation require authoritative data adapters, model inference, retrieval and domain-specific schemas.
3. **Not yet live trend discovery:** Learning signals are manually ingested and quarantined. There is no scheduled crawling, licensed feeds, trust scoring, source cross-checking or evidence verification.
4. **No automatic learning promotion:** Skill evaluation is a library utility, not an operational evaluation queue or deployment pipeline. A separate approval and versioned release process is required.
5. **No external effects:** Publishing, CRM writes, advertising spend and live model calls remain disabled pending scoped connectors, compliance gates and budget enforcement.
6. **Entra staging configuration remains deferred** while production authentication remains fail-closed.

## Completion criteria for the requested fully operational OS
- For each of 13 agents: authoritative read adapters, typed input/output, actual specialized reasoning, domain actions, measurable acceptance tests, governance and failure recovery.
- For the brain: durable orchestration worker, checkpoint transactionality, bounded retries, leases/fencing, operator controls, causal event routing and production observability.
- For learning: source ingestion adapters, provenance, independent verification, trend scoring, evaluation datasets, approved skill version rollout and rollback.
- For nervous system: typed event contracts, inbox/outbox, handoff routing, consumer idempotency, alerting, service-level objectives and reconciliation.
- For security: end-to-end tenant isolation, least-privilege tool access, audit, consent, scientific/legal review, human release and staging integration tests.

This tranche delivers the **foundation and regression gates**, not the full completion criteria above.
