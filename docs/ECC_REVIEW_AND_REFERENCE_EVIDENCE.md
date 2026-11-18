# ECC Tools review — relevant evidence and release boundaries

Review of [PR #1](https://github.com/Ashour158/medsol-ai-marketing-os/pull/1) comments dated 2026-11-18. The ECC `0/7` score measured **changed-file reference-evidence coverage**, not the repository's feature completeness or its CI result. The comments were neutral, not failed security checks. ECC reported `Check publication was denied or unavailable`: the ECC GitHub App owner must grant **Checks: read and write**, and the installation owner must approve the permission update; repository commits cannot grant app installation privileges.

## Reuse Map
- Deterministic analysis: `assessDomain` in `packages/agent-runtime/src/domain-intelligence.ts`.
- Agent work-package evidence: `createMarketingWorkPackage` in `packages/agent-runtime/src/domain-work-packages.ts`.
- Model boundary: `GovernedModelService` and `OpenAIResponsesAdapter`; provider selection belongs only to this composition root.
- CI: existing `.github/workflows/ci.yml`.
- No second event bus, workflow dispatcher, marketing model, agent roster or business owner has been created.

## Category by category
| ECC category | Applicability | Executable evidence / boundary |
| --- | --- | --- |
| Deep analyzer corpus | Applicable | `apps/api/src/fixtures/marketing-analyzer-golden.json` and `marketing-analyzer-golden.test.ts` run fixed, expected results against all 13 deterministic agent domains, including independent scientific verification, brand and consent gates, and cross-tenant evidence denial. These are *logic regression fixtures*, not AI output benchmarks. |
| RAG/evaluator comparison | Partially applicable | `marketing-evidence-comparison.json` and `marketing-evidence-comparison.test.ts` validate acceptance/rejection of reviewed numerical evidence across all 13 owned work packages. A retriever, vector index, relevance ranking, LLM judge or golden retrieval benchmark **does not exist in this OS**. Its absence must not be reported as an evaluated RAG engine. |
| PR salvage/review | Maintainer-only policy; no product runtime | `scripts/quality/pr-review-salvage-policy.mjs`, fixture and golden tests advise human owners on stale PRs, review threads, reopen and unavailable checks. No GitHub write actions or parallel marketing service. |
| Discussion triage | Future domain behavior | Social & Community agent currently produces review-only briefs, not an automated informational/answered/no-response classifier. Build and score a corpus against actual classification logic when that logic is explicitly implemented; no triage capability is falsely claimed. |
| Harness compatibility | Applicable as a **negative boundary** | `model-harness-compatibility.test.ts` checks fail-closed behavior for unsupported provider names. The only implemented model provider is explicit OpenAI Responses. Claude, Codex, OpenCode, Zed, dmux and generic agent surfaces are *not integrated or certified*. |
| Security evidence | Applicable | CI `security-evidence` job produces a scanner-generated SPDX SBOM (on successful scan), captures the real `pnpm audit --json` response and exit code, and uploads those files with 30-day retention. Scanner failure is recorded as failure evidence, **not automatically interpreted as a clean scan**. This is preliminary evidence, not a complete secure-development assessment or signed attestation. |
| CI failure-mode evidence | Applicable | See exact prior CI failure examples below and existing GitHub Actions run logs. E2E staging fault injection remains a separate gate. |

## Concrete bug found and corrected
`domain-work-packages.ts` was using a double-escaped pattern (`/^\\d{1,24}$/`) to filter reviewed metric totals. The expression matched a literal backslash and 'd' rather than decimal digits, silently removing valid human-reviewed KPI strings. It is now `/^\d{1,24}$/`. The golden comparison fixture tests valid reviewed KPIs, malformed values, missing review, unknown metrics, and 13-agent propagation.

## Real CI failure modes captured from previous PR #1 iterations
- [Run 44317984699](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44317984699) — web `route.ts` strict TS2345: optional path segment `string | undefined` passed to a string-only array lookup. Fix: `action ?? ''`.
- [Run 44318159159](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44318159159) — API regression test strict TS2532: indexed incident list entry could be undefined. Fix: optional access in the assertion.
- [Run 44318376404](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44318376404) — follow-up run passed typecheck, migrated clean and historical databases, tested and built.
- Troubleshooting: reproduce with `pnpm install --no-frozen-lockfile && pnpm prisma:generate && pnpm --filter './packages/**' build && pnpm typecheck && pnpm test && pnpm build`. A failed compile must block merge; do not ignore it as a scanner nuisance.
- Runtime failure modes requiring staging evidence: model response may succeed just before worker crashes, so model spend and execution outcome become uncertain. Existing Brain policy forbids automatic replay; reconcile the authoritative execution and provider invoice before manual decision.

## Owner-action item
The ECC GitHub App cannot publish Check Runs from these comments alone. An app owner must request the `Checks: read and write` permission and an installation owner must accept that change. GitHub Actions `verify` remains a separate genuine check and must stay required when branch protection is configured. No permission is changed by this pull request.

## Not cleared
Live production identity/Entra configuration, independently attested research claims, model invoice authentication, true content evaluation against expert rubrics, multi-provider harness compatibility, and staged distributed crash injection remain unverified. Evidence files do not authorize external publication, paid ads, customer contact or self-modifying agent skills.

## Actual SBOM and dependency advisory findings (2026-11-18)
The security-evidence job in [run 44320547067](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44320547067) successfully generated an SPDX SBOM with Syft and captured an audit artifact. `pnpm audit --json` returned **exit code 1** with **2 critical, 2 high and 3 moderate** advisories against the first scanned dependency resolution; the scan was **not clean**.

| Package path | Initial severity | Finding / mitigation status |
| --- | --- | --- |
| `vitest > tinypool@1.1.1` | Critical (2 advisories) | Upgrade workspace Vitest declarations to ^4.1.12 and confirm fresh audit + tests |
| `vitest > picomatch@4.0.7` | High | Advisory reports no safe patched version in the scanned metadata; manually investigate exposure and a supported upstream fix |
| `prisma > @prisma/config > deepmerge-ts@7.1.5` | High | Add pnpm override to 8.0.0 and run full Prisma generate/migrate rehearsal; do not claim compatibility before CI |
| `vitest` and `@vitest/mocker` | Moderate (3 advisories) | Upgrade workspace Vitest declarations to ^4.1.12; rescan |

An audit process return code can also indicate tool/network failure; here the artifact contained explicit advisory records and a vulnerability severity summary. Treat it as a genuine **unresolved security finding** until a follow-up scan and dependency path review prove otherwise. The standalone job intentionally collects evidence without blocking feature CI; **deployment approval must separately require reviewing and clearing or explicitly risk-accepting unresolved applicable findings**.

Run 44320547067 also failed the application typecheck because the new tests used `import.meta` in a CommonJS-compiled package (TS1470); golden fixtures now resolve from the package working directory. Neither advisory presence nor test errors should be masked by a green standalone scanner-job indicator.

### Fresh remediation scan — run 44321339163
The proposed updates to Vitest ^4.1.12 and overridden `deepmerge-ts@8.0.0` were exercised by [CI run 44321339163](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44321339163): typecheck, clean migrations, historical migration rehearsal, tests, and build all passed. The fresh Syft SBOM was generated and archived.

Actual refreshed `pnpm audit` artifact: **0 critical, 1 high, 0 moderate** advisory records. The only remaining finding is `picomatch@4.0.7` via development test tooling (`vitest`), GHSA-fc5q-39xc-vjpf. The audit metadata reported no patched version for that advisory. This finding is tracked in [security issue #4](https://github.com/Ashour158/medsol-ai-marketing-os/issues/4) and remains unaccepted for production deployment. This should not be confused with a production runtime exploitation assessment; exposure and upstream fixes require separate owner review.
