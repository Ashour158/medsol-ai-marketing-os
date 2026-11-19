# R3-K — Security Red Team, Disposable PostgreSQL Restore & Acceptance Expansion

**Date:** 19 November 2026. **Classification:** implemented and CI-gated offline hardening; **R3 NOT CERTIFIED / NO PRODUCTION RELEASE**. There are no connected real provider accounts, remote MCP/A2A operations, actual customer sends, or autonomous skill releases.

## Mandatory architecture Reuse Map

| Concept | Existing source of truth | R3-K modification | Forbidden shadow owner |
|---|---|---|---|
| Knowledge content, provenance, review, retrieval and memory | `MarketingLearningService`; `KnowledgeDocument`, `KnowledgeChunk`, `AgentKnowledgeMemory` | Bounded defense-in-depth scanner before promoting agent-scoped evidence, memory and learning; suppress risk-marked legacy excerpts at query time | New autonomous knowledge trust store, standalone vector database, unapproved prompt injection "cleaner" |
| Tool metadata and capability policy | `parseToolManifest`, `GovernedToolRegistryService` | Reject malformed or empty hostname labels even when egress remains disabled | New MCP implementation or direct tool network access |
| Workflow deployment, lease/recovery and human review | `MarketingWorkflowService`, `WorkflowLeaseService`, `ApprovalService`, `AgentService` | Reuse existing release/lease/approval security barriers in adversarial corpus; prior R3-J two-worker tests remain in CI | New workflow ledger, approval pipeline, replay queue |
| Social publishing/ESP | `LockedOfficialProviderDispatchGateway`, synthetic publishing and email modules | Assert no real effects even if permit/metadata are forged | Real publish/send provider configuration |
| Auth and tenant access | `marketing-permissions`, authenticated OIDC guard, PostgreSQL FORCE RLS | Executable deny-by-default route mutation corpus and restored low-privilege RLS proof | Separate tenant session or bypass of canonical permission registry |
| Backup and operational proof | CI's existing migrations and PostgreSQL 16 service | Guarded ephemeral `pg_dump`/`pg_restore` rehearsal with seed, fingerprint, schema, FORCE RLS and tamper checks | Production DR certification or any read/write access to live accounts |
| QA acceptance | Master 500-case plan and existing Vitest/Prisma CI | Run **additional bounded synthetic negative cases**; preserve truthful distinction between offline unit/integration and independently executed E2E | Inflating 500-case completion from a generated corpus |

## Delivered: adversarial corpus and explicit limitations

- `apps/api/src/r3k-security-redteam-corpus.test.ts` covers known malicious agent-role delimiters, override instructions, demands for secrets, unauthorized shell/MCP commands, Unicode fullwidth and zero-width variants. For each input the **actual agent text policy** must return not eligible. It also checks legitimate scientific text to reduce obvious false positives.
- Additional independent mutations exercise the **actual** `permissionForMarketingRoute`, role policy, signed Ed25519 DAG manifest parser and signature validator, deterministic canary, MCP HTTPS origin metadata, and the locked official publishing gateway. These are isolated synthetic policy tests, **not** a penetration test of a running hosted app.
- `agent-content-firewall.ts` is a small pure deterministic indicator checker. It is integrated into the **existing** `MarketingLearningService`: known risk-marked `AGENT_SCOPED` sources cannot be approved; known-risk memory cannot be proposed or approved; previous sources are filtered from agent-visible chunk excerpts; source-linked learning signals cannot be promoted from flagged evidence. Reviewer-only sources can still hold untrusted threat analysis. Remote model-enabled reasoning continues to suppress excerpts per the earlier R3-H policy. **No regex classifier can detect every attack**; these checks are defense-in-depth, not authority.
- `postgres-r3k-injection-quarantine.integration.test.ts` tests actual PostgreSQL maker/checker authorization, quarantine after failed review, cross-tenant access denial, no unsafe memory, absence from agent context and zero model usage.
- `governed-tool-manifest.ts` now rejects empty, trailing-dot, leading-dot, oversized and invalid DNS labels in tool metadata. This is NOT DNS resolution, IP pinning, redirect validation or SSRF-safe remote dispatch. Remote tool dispatch remains blocked.

## Executable disposable PostgreSQL recovery drill

`scripts/quality/r3k-offline-dr-rehearsal.mjs`, added to `.github/workflows/ci.yml`, runs with **mandatory** guards: `CI=true`, `GITHUB_ACTIONS=true`, `MARKETING_DB_INTEGRATION=1`, `MARKETING_DR_CI_ONLY=1`, numeric `GITHUB_RUN_ID`, and an exact `marketing_test` localhost:5432 PostgreSQL connection. It **refuses to run** against any other host, username or database.

1. Create two new run-specific disposable PostgreSQL databases and migrate the first through the canonical historical migration chain.
2. Seed two synthetic tenants with User, Agent, AgentExecution, BLOCKED WorkflowExecution, OUTCOME_UNKNOWN WorkflowStepExecution, quarantined KnowledgeDocument, AuditEvent, unpublished OutboxEvent, InboxEvent and CommandReceipt. No actual provider accounts or data.
3. Dump with PostgreSQL custom-format `pg_dump` into a temporary file; SHA-256 hash the archive. Restore it into a separate clean DB using `pg_restore` to emit SQL plus `psql -v ON_ERROR_STOP=1`. For PostgreSQL 16 compatibility with the hosted runner's newer client, only a `SET transaction_timeout = 0;` session preamble line is omitted; no DDL, business row or permission is modified.
4. Compare ordered row fingerprints in **11 canonical tables** across source and target for both tenants. Run actual `prisma migrate diff --exit-code` against restored schema.
5. Check FOUR restored knowledge/memory/graph tables still have `FORCE ROW LEVEL SECURITY`; create a low-privilege test role and prove zero rows without tenant context, tenant-A-only visibility with its transaction-local context, and tenant-B-only visibility after switching that context.
6. Check uncertain workflows remain blocked, outbox remains unpublished with zero attempts, and model usages/provider credential/publication tables remain empty. Intentionally alter one **restored** disposable row and verify fingerprint mismatch is detected.
7. Upload JSON evidence artifact `medsol-r3k-offline-dr-evidence-<run_id>` with backup digest, tenant count, table fingerprints count, RLS proof, schema-diff verdict and tamper detection. **Never upload the raw backup**. Delete temporary archive and both disposable databases in finally.

**Important limitations:** This establishes that an internal synthetic PostgreSQL state can be dumped and restored in GitHub CI. It is not a production physical backup strategy, PITR test, encryption/key-recovery proof, production-data retention/legal-hold proof, cross-region restore, application restart/warmup test, remote object-store byte restore, two-node failover, measured customer recovery time, verified RTO/RPO, or third-party security/DR signoff.

## Evidence, signoff, remaining blockers

The R3-K PR must have successful final-head CI: TypeScript, clean and historical migrations with no schema drift, every API/web/workspace test including R3-K Postgres quarantine and red-team corpus, the real disposable `pg_dump`/`pg_restore` drill, build, reference-set validation, SBOM and dependency audit **evidence artifacts**. Dependency-audit findings remain separately reviewable: a green evidence-collection job is **not** the same as an audit reporting zero vulnerabilities.

**R3 verdict remains NOT CERTIFIED.** The master 500-case program has not been independently executed end-to-end; this tranche adds a significant adversarial *subset*, not the 500. Remaining launch blockers include independently reviewed penetration testing, broader network/SSRF and model prompt-injection testing, legally and technically verified provider integrations (deliberately postponed by instruction), production-style backup/restore/failover and on-call response, model invoice reconciliation, and customer/brand/agency access and privacy UAT.

No live provider connection should be attempted until the entire engineering and acceptance process is finished and separately approved.
