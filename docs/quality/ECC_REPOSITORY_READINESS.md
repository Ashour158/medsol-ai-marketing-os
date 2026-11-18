# ECC Tools / Reference-Set Readiness — Repository-Level Evidence

**Applies to:** `Ashour158/medsol-ai-marketing-os` after Master Blueprint v2.1 and R1 brand/agency integration.

## Interpreting the repeated `0/7` messages

ECC bot comments at commits `03e6b13`, `e94e7d3`, `851a009`, `00af434`, `b3a9255`, `675a6e9` and `4e7db5b` **explicitly inspect the files changed in that PR**. A neutral `0/7` does **not** mean earlier-committed analyzer, retrieval, discussion, security and CI fixtures vanished.

Instead of introducing shadow product domains or copying fixtures into every unrelated PR:

- Maintain one source-checked, repo-wide `ECC_REPOSITORY_EVIDENCE_MANIFEST.json`.
- CI runs a strict path verifier and offline maintainer PR-review golden tests; it emits `ecc-reference-readiness.json` as a GitHub Actions artifact.
- The report says **reference paths present**, not "7/7 product features implemented", "RAG certified", "Claude/Codex supported", "security audit passed", or "ECC Check Runs published".
- ECC may continue reporting `0/7` for changes that do not directly touch evidence fixtures. **Do not game changed-file percentages** by duplicating or editing unrelated files in every PR.

## Verified repo evidence categories and exact limitations

| ECC category | Path | Scope/limitations |
| --- | --- | --- |
| Deep analyzer | `apps/api/src/fixtures/marketing-analyzer-golden.json` + `marketing-analyzer-golden.test.ts` | Current deterministic 13-agent analysis, not all production AI reasoning |
| RAG/evaluator | `apps/api/src/fixtures/retrieval-evaluator-reference-set.json` + `retrieval-evaluator-reference.test.ts` | Lexical metadata ranking with NDCG/expected order, not full vector RAG |
| PR salvage/review | `scripts/quality/fixtures/pr-review-salvage-golden.json` + `pr-review-salvage-policy.mjs` and tests | **New maintainer-only, offline advisory policy**, not a Marketing OS microservice, bot or live GitHub action |
| Discussion triage | `apps/api/src/fixtures/discussion-triage-golden.json` + `discussion-triage-golden.test.ts` | Human-reviewed classification, no automatic posting or live social inbox |
| Harness compatibility | `apps/api/src/model-harness-compatibility.test.ts` | **Negative, fail-closed** tests for unsupported providers and harnesses. No multi-harness certification |
| Security evidence | `docs/security/SBOM_AND_AUDIT_EVIDENCE.md` + `.github/workflows/ci.yml` | Real GitHub Actions Syft SPDX SBOM + `pnpm audit` artifact; inspect advisory records, security issue #4 remains open |
| CI failure modes | `apps/api/src/fixtures/ci-failure-modes-reference.json` + regression tests and `docs/quality/CI_FAILURE_MODES.md` | Genuine captured GitHub Actions failures; does not certify E2E DR or all workflows |

The PR-maintainer policy deliberately returns `advisoryOnly:true` with **zero** authority to close, reopen, merge, comment or publish a GitHub Check. It handles stale PRs, unresolved review threads, changes requested, changed head after approval, reopened-flow requests, failed/pending/unavailable Checks and malicious PR text as inert data. This makes the generic corpus relevant to developer governance without contaminating the commercial marketing agent/runtime architecture.

## GitHub App permissions — separate owner action

Issue [#3](https://github.com/Ashour158/medsol-ai-marketing-os/issues/3) remains open. An ECC **GitHub App owner** must request `Checks: Read and write` for the app; a GitHub **installation owner** must then approve the permission change for this repository. Afterward, create a disposable PR and confirm a **real ECC Check Run** appears in the commit's Checks tab.

The new repository evidence summary is produced by GitHub Actions; it does **not** grant or simulate ECC app permissions. Do not mark ECC as a required branch-protection check until the integration is reliably publishing meaningful checks. Keep the existing GitHub Actions `verify` gate independent.

## Auditability and release gate

Evidence is only useful if:
1. Its source/test is genuinely present on the current checkout (strict path validation).
2. The appropriate test has run and passed on the **exact** branch SHA.
3. Any historical CI failure references a real run, and its remediation is validated by a later green run.
4. Scanner reports and live configuration are inspected before a production-risk decision.
5. Tenant isolation, provider entitlement, identity/RLS, and external-effect acceptance are not inferred from a reference-set count.

Run locally (Node 22):

```bash
node --test scripts/quality/pr-review-salvage-policy.test.mjs
node --test scripts/quality/ecc-repository-readiness.test.mjs
node scripts/quality/ecc-repository-readiness.mjs --output ecc-reference-readiness.json
```

Then run the existing `pnpm typecheck`, `pnpm test`, actual PostgreSQL migration tests and `pnpm build` before merging. The 500-scenario commercial acceptance roadmap remains planned, not executed.

The reference-set report will still state its limits even when all seven areas have valid file paths. That is deliberate: reference coverage is neither a product release gate nor commercial readiness.
