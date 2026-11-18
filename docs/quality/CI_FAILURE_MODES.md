# Reproducible CI failure-mode evidence

These examples come from actual prior Medsol GitHub Actions runs, **not fictional dry-run output**. Structured references live at `apps/api/src/fixtures/ci-failure-modes-reference.json` and are validated by `apps/api/src/ci-failure-modes-reference.test.ts`.

| Run | Failure | Expected action |
| --- | --- | --- |
| [44317984699](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44317984699) | TS2345: optional web path component passed as nonoptional string | Block, narrow route segment, rerun typecheck |
| [44318159159](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44318159159) | TS2532: unsafe test array indexing | Block, assert presence/use safe indexing, rerun |
| [44320547067](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44320547067) | TS1470: `import.meta` in CommonJS module | Block, resolve fixture path using supported module/package path |
| [44320547067](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44320547067) | Nonzero `pnpm audit` with real dependency advisories | Block production release approval, even when evidence upload succeeds |
| [44372190913](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44372190913) | Prisma P2003 FK failure: incident scanner fixture scanned another test's disposable tenant and created an outbox alert during cleanup | Scope incident scanner fixture to its tenant; preserve production scanner behavior, rerun full PostgreSQL CI |

## Diagnosing future runs

Run `pnpm install --no-frozen-lockfile`, `pnpm prisma:generate`, `pnpm --filter './packages/**' build`, `pnpm typecheck`, `pnpm test` and `pnpm build` with Node 22 and pnpm 10.12.4. For integration regressions, use a disposable PostgreSQL database and the migration-deploy and drift-diff steps in `.github/workflows/ci.yml`. Never run destructive repair commands on a production database.

The fixture is evidence of CI troubleshooting readiness. **Worker crash-injection, outbox delivery failures, distributed retries and live OIDC errors are still separate staging tests**, not claimed complete by this suite.

## Verification owners

- CI and developer experience: code owners; failed compile/migration/test/build blocks merge.
- Security advisory review: engineering and security; a scan-result upload does not accept risk.
- Brain incident handling: existing `BrainRun` / `OutboxEvent` owners; no automatic replay of uncertain remote operations.
