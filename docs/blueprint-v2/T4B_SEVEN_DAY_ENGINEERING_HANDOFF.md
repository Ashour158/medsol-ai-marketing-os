# T4B — Seven-day sprint engineering evidence bundle

**Scope:** Automated, immutable-commit GitHub Actions CI-only acceptance aggregation. **Release: NOT_CERTIFIED.** It does not deploy staging, connect external providers, prove production readiness, or constitute independently executed 500-case E2E acceptance.

## Reuse Map
- R3N tenant RLS census remains the authority for actual disposable PostgreSQL tenant isolation evidence.
- R3X PostgreSQL, R3W browser, R3Y real-stack, T1F signed operator, T3C signed DAG, T3D knowledge DAG and T4A creative validators remain the **suite-specific** execution provenance authorities. This module only verifies existing outputs and digests.
- The R3Y operator handoff remains the canonical unsigned planned 500-case QA handoff.
- The preexisting production-release-certification validator remains the **sole** five-signatory independent production evidence gate; T4B never creates, signs or overrides certification.
- No new business tables, workflow authority, tenant IAM, approval service or external provider access.

## Engineering evidence
The new step, after the actual browser and PostgreSQL suites and operator handoff, rejects missing, cross-run, cross-commit and incorrectly labelled evidence. It validates 46 FORCE RLS tenant tables, 37 isolated PostgreSQL integration cases, 51 synthetic Chromium cases, 19 real-stack Chromium cases, five real-stack signed-OIDC operator journeys, actual signed workflow, knowledge DAG and offline creative browser suites. Signed DAG case count follows the actual test evidence (three baseline, four after T2H).

The JSON artifact *t4b-seven-day-engineering-handoff.json* enumerates exact same-run proof filenames, SHA256 digests, actual engineering case counts and remaining independent requirements. It deliberately records zero independent E2E signoffs, zero real provider accounts, no production readiness and no persistent deployment. It is **not a release certificate**.

## Verification
Run the Node-native negative regression suite with:
node --test scripts/quality/t4b-sprint-engineering-evidence.nodecheck.mjs

The complete GitHub verify job must also pass, including signed browser, non-bypass RLS, no-egress staging and recovery tests.

## External completion blockers
Persistent secured staging and operator-controlled OIDC identities; human MFA; independently executed 500-case QA; external penetration test; production-like PITR/restore/RTO/RPO and rollback; regulatory/privacy and accessibility review; official provider sandbox entitlements and receipts; independent business/security release signatures.

**Engineering CI acceptance is neither Blueprint v2.1 feature completion nor commercial production certification.**

## Discovered serializable contention and bounded domain fix

During the first PR CI, the existing R3-P PostgreSQL integration case T08-032 intermittently hit Prisma P2034 on BrandMasterService.propose. That transaction contains only a versioned Brand Master insert and its audit write, both in one serializable PostgreSQL transaction. The authoritative Brand Master service now retries only a confirmed aborted P2034 at most twice more, then returns an explicit conflict; unique version P2002 still fails closed. Independent Vitest cases assert one persisted/audited write after a transient abort and no ghost write after exhausted retries. Do not generalize this retry to commands with external effects. The post-fix GitHub CI result is required; no success is assumed until it passes.
