# T6B — Enterprise Staging / Independent 500-Case QA / Security / Production Controls

**Release status: NOT_CERTIFIED. Engineering-only hardening; no real deployment or human signatures are created.**

## Reuse Map (one domain owner)

| Evidence or decision | Existing authority | T6B extension |
|---|---|---|
| Planned 500 E2E scenarios, suite IDs and CI-vs-human evidence | `scripts/quality/r3l-acceptance-case-index.mjs` and `r3y-operator-handoff.mjs` | Original 500 index only. Production certificate binds its ordered case IDs by SHA256 digest to the exact signed payload; cannot substitute 500 fake IDs |
| Production release decision | `production-release-certification.mjs` | **Extend** original independent five-role Ed25519 verifier; no new production release engine or signatory registry |
| Operator staging, OIDC, MFA, tenant security | Existing T1E staging config and `t1e-staging-preflight.mjs` | Require a separately observed, public-HTTPS, persistent staging proof before a production certificate can pass |
| Tenant and delegated agency access | Existing OIDC User/AuthSession, AgencyGrant, Campaign owner, RLS and R3M PostgreSQL tests | Production staging attestation must independently prove agency/tenant isolation and non-BYPASSRLS restricted application role; not inferred from CI |
| Security and DR | Existing R3K red-team, disposable backup restore; independent pentest and DR signatures on the canonical production checker | Require operator proof digest, TLS validation, real backup/restore/rollback, five independent signatories; no fake CI signatures |
| Provider workflows | PlatformIntegrationHubService, official provider dispatch gate, ESP/social simulators | Keep all effects disabled during no-account engineering; real official sandbox UAT stays a separate mandatory signed production precondition |

## New nonwaivable checks

1. The production-release verifier accepts only `medsol-r3y-real-stack-500-case-acceptance-index-v1` with 500 distinct canonical `T01`–`T16` case IDs and 500 planned slots. Its external five-role signed payload must include `canonicalCaseIndexDigest`, the SHA256 of the ordered canonical case IDs. Shifting, omitting, duplicating or substituting case IDs fails.
2. The same signed production payload must include `staging` evidence of schema `medsol-independent-staging-evidence-v1`: exact immutable commit, a nonfake public HTTPS origin (not IP, localhost or `.example/.invalid/.test`), distinct staging identity provider with MFA, independently observed tenant+agency RLS, real non-BYPASSRLS app role, TLS, backups and rollback, operator ID, immutable image digest and artifact proof digest.
3. The initial and final independent staging checks must be at least 24 hours apart, with the latest check no older than seven days. **These timestamps and artifacts are assertions signed by external operators; the script does not independently observe continuous uptime, TLS, remote DNS or actual deployment.** This limitation is preserved in the returned verdict.
4. Existing production controls still require *all* 500 independently executed PASS E2E cases with per-case artifacts, 5 distinct externally configured independent Ed25519 signatories (QA, pentest, platform security, disaster recovery, business owner), zero critical/high security defects, actual restoration, official eligible provider UAT, legal/consent checks, on-call and rollback drills. No fake certificate can be generated from CI.

## Operator execution sequence (requires an externally operated environment)

1. Provision a persistent, isolated HTTPS staging environment with separately operated staging IdP and two genuinely separate tenant/agency operator memberships. Follow `T1E_OPERATOR_STAGING_RELEASE.md`; use restricted PostgreSQL non-BYPASSRLS runtime role and segregated migration credentials. Do not use real provider accounts during offline engineering.
2. Test actual browser sign-in/out, signed tenant identity, delegated agency read-only grants, forced RLS, 13 agents, signed DAG human waits, reviewed knowledge, creative rights, simulated social/email, metric/quarantine/review and no-egress effects. Retain genuine source hashes, TLS evidence, DB role logs and operator screenshots/traces.
3. Record independently observed staging checks 24h apart using `infra/staging/persistent-staging-evidence.template.json` as the *blank checklist*. Do not commit sensitive credentials or public staging identities. Populate real confirmed facts only; retain the full underlying evidence securely.
4. Independently execute each case in the existing 500-slot `r3y-real-stack-acceptance-evidence.json` case index, using real operators; record PASS/FAIL, artifact digest, timestamp, run ID and issue triage. The current CI acceptance index intentionally marks 500 as unexecuted.
5. Independently complete pentest, restore/PITR, backup recovery, official provider sandbox/consent/legal checks. Five authorized, separate external humans sign the exact release payload under their configured external Ed25519 trust keys. No engineer may self-issue sign-off.
6. Run `MARKETING_RELEASE_TRUST_KEYS_JSON=<externally-controlled-public-key-map> MARKETING_RELEASE_COMMIT_SHA=<actual-image-commit> node scripts/quality/production-release-certification.mjs --certificate <independently-signed.json> --case-index <canonical-index.json>`. Preserve the exact result, signatures and decision in your external change-management system. A passing verifier **only validates submitted signatures and structure**; release still requires authorized change approval and independent operational evidence.

## Acceptance truth at handoff

- CI can pass engineering tests while production release verification **must remain blocked** until these external artifacts exist.
- Neither GitHub Actions nor this assistant can manufacture independently signed 500-case human execution, real 24-hour persistent deployment, eligible third-party provider entitlements, pentest, operating budgets, external DNS/TLS or audited backups.
- Real account connectivity remains disabled until the user explicitly authorizes a later gated deployment.

**Next external inputs:** staging domain/host and TLS, staging IdP, restricted Postgres, deployment secrets, independent test operators and pentest/DR owners. No hosting was purchased or customer provider credentials connected.
