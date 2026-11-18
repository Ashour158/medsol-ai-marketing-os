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
| PR salvage/review | Not applicable to the deployed domain | No stale-PR queue cleanup, review-thread salvage, reopen automation, or PR lifecycle subsystem belongs to this marketing product. Do not implement a parallel GitHub orchestration service to satisfy the ECC product-wide generic reference-set prompt. |
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
