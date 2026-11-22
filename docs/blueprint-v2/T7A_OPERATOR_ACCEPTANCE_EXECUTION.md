# T7A — Independent enterprise acceptance execution packets

**Verdict:** NOT_CERTIFIED. This engineering tranche does not create persistent staging, independent signatures or executed E2E cases.

## Reuse Map
- The existing `scripts/quality/r3l-acceptance-case-index.mjs` is the **sole 500-case allocation authority**: T01–T16, exactly 500 cases, 284 engineering assertions (not independent E2E).
- `r3y-operator-handoff.mjs` remains the aggregate operator handoff owner; `production-release-certification.mjs` remains the sole signed release decision engine.
- This T7A tool is only a deterministic **presentation/scheduling projection** of the canonical register. It creates no database, acceptance status, reviewer identity, cryptographic signature, QA result, deployment evidence or provider access.

## Actual usage
1. Generate the canonical 500-case index from the repo, without claiming CI verification: `node scripts/quality/r3l-acceptance-case-index.mjs --output r3y-real-stack-acceptance-evidence.json`. For validated engineering evidence, use the matching same-run CI artifact, not local output.
2. Run `node scripts/quality/independent-qa-packets.mjs --index r3y-real-stack-acceptance-evidence.json --output-dir ./private-operator-packets`. The script writes ten 50-case unsigned packets and a manifest, with restrictive permissions and no overwrite. Each case is `NOT_RUN`; all human IDs, observed behavior, timestamps, artifact digests, defect references and signatures are null.
3. Assign each packet to **independent** tenant/agency operators with actual persistent staging access. Preserve evidence in an externally controlled QA system, not in Git or the unsigned packet artifact. Verify human OIDC MFA, non-BYPASSRLS, agency/tenant boundaries, simulated creative/social/email, no provider egress, recovery and usability.
4. Record actual PASS/FAIL, case IDs, tenant/agency, tester, immutable deployment commit, run ID, UTC timestamp, expected/observed behavior, defect triage, SHA256 evidence and distinct independent reviewer signatures. Never auto-mark `PASS` from CI.
5. Independently sign the 500-case payload and persistent staging proof using the pre-existing `production-release-certification.mjs` five-role trust process. Official provider UAT and production pentest/DR remain mandatory later gates.

## Acceptance controls
- The tool refuses any altered case order, duplicate, substitution, prior human signoff, already executed case, malformed index or unbounded batch size.
- CI tests the negative cases and uploads the **unsigned** packets. Uploading an artifact does not mean an operator ran a case.
- The operator packets must never be mistaken for independently executed test reports. Their `NOT_RUN` and `NOT_CERTIFIED` fields cannot be overwritten by this generator.

**Next external dependency:** actual persistent HTTPS staging with separate operator identities, then 500 independent executions. Track in issue #96.
