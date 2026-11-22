# T4F — Seven-day OFFLINE engineering sprint closeout

**Scope:** The seven-day accelerated engineering sprint, not full Master Blueprint v2.1 release or externally verified production UAT. **Product release verdict: NOT_CERTIFIED.** CI evidence must come from an actual green run on this exact PR/commit and its tested merge.

## Reuse Map — no parallel business owner

| Acceptance concern | Existing authority | T4F extension |
|---|---|---|
| Canonical campaign/status | `CampaignService`, `MarketingWorkflowService`, `MarketingReadService.offlineJourney` | Read-only journey comparison |
| Maker/checker and immutable creative | `ApprovalService`, `CreativeAssetService` | Existing signed-operator browser test |
| Sandbox social and email | `CampaignPublicationService`, `SyntheticAudienceEmailService` | Same existing offline flow and no-egress assertions |
| Performance and source review | `MarketingPerformanceService` | Append real quarantined synthetic-source metric, independently review and verify journey tenth gate |
| Agent/learning | `BrainRunLedgerService`, `MarketingLearningService` | Verify signed 13-agent orchestration and quarantined feedback in same journey |
| Readiness inspection | T4C/T4D/T4E pure derived projection and browser board | Signed-operator readback, displayed 10/10 and unsigned JSON export |
| Engineering evidence | `scripts/quality/t4b-sprint-engineering-evidence.mjs` and suite-specific R3N/R3X/R3W/R3Y/T1F/T3C/T3D/T4A validators | Require actual signed full-journey case T17-001 in the same real CI run; reject substituted case IDs |
| Independent customer acceptance | R3Y canonical 500-case unsigned handoff + preexisting five-signatory production verifier | **Unchanged**; no fabricated signoff |

## Exact final cross-module acceptance path

The existing `T17-001` browser test executes on production-built Next, compiled Nest, a disposable signed TLS OIDC issuer, and a restricted FORCE-RLS PostgreSQL role. It must now prove, **within the same independently authenticated maker/checker journey**:

1. Create authorized tenant objective and campaign; execute existing 13-agent offline Brain run.
2. Store synthetic PNG bytes, block creator self-approval, and record separate human campaign and creative/rights approvals.
3. Register inert destination, prepare exact approved publication intent, execute SANDBOX attempt with **zero remote posts**.
4. Create a synthetic recipient and mock consent; simulate email with **zero actual messages**.
5. Quarantine synthetic feedback; ingest a noncausal, synthetic-source performance observation in the existing Performance ledger.
6. Refuse maker self-review, allow separately signed reviewer, verify `REVIEWED` does not imply independently verified financial outcome.
7. Read the canonical journey and verify ten truthful offline stages, APPROVED campaign, COMPLETED workflow and no provider/production flags.
8. Refresh the authenticated Campaign Readiness Board and confirm `10/10` offline gates; download the unsigned JSON inspection and verify the same campaign, NOT_CERTIFIED, no live effects.

This is one source-linked browser E2E with real persistence and server-enforced permissions. It does not substitute for live-provider testing, production penetration testing or five-party signoff.

## Engineering acceptance requirements

- CI full `verify` job passes typecheck, unit, real PostgreSQL migration/integration/RLS, 51 synthetic browsers, 19 real-stack browsers, signed-operator suite (5), signed DAG, knowledge DAG, creative iteration, repository build, disaster-recovery rehearsal and strict 500-slot **unexecuted** QA handoff.
- `dependency audit and SBOM evidence` job is green, with findings reviewed separately.
- T4B same-run evidence verifier confirms ten proof files, source digests, expected case counts, zero uncovered tenant tables, zero real providers and the added required signed operator T17-001.
- PR is squash-merged only after GitHub CI success; report the merged commit and exact CI workflow run. If the merge is based on a newer base commit, note that CI was run on a PR merge ref and retain any additional merge verification.
- No hidden automatic approval or offline-to-live escalation.

## Closure classification

Once all engineering requirements are green, label the **seven-day offline engineering sprint**: `ENGINEERING_CI_HANDOFF_COMPLETE`, not `PRODUCTION_READY`, `FULL_BLUEPRINT_IMPLEMENTED` or `500_CASES_EXECUTED`.

**Still outstanding and outside this sprint closeout:** persistent independently controlled staging/SSO; 500 separately executed and signed independent E2E cases; independent pen-test; production-like backup/PITR and RTO/RPO; accessibility/privacy/rollback signoffs; official provider account eligibility, OAuth/scope verification and reconciled remote receipts; completion of the remaining R1–R5 commercial Blueprint v2.1 engines, studios and workflows.

## Runtime/cost boundary

No paid hosting, real social posts, real email, paid model calls, or enabled provider integrations are required for the offline engineering handoff. All such actions remain default denied.
