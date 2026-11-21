# T1F — Full signed-operator real-stack campaign acceptance

**Engineering scope (21 November 2026). Production NOT_CERTIFIED.**

## Reuse Map
- Uses the existing Next OIDC/PKCE login/callback, Nest signed access-token guard, encrypted browser session, pre-provisioned Users/tenant roles and FORCE-RLS PostgreSQL. No new authentication owner.
- Drives the existing Campaign, Objective, Workflow, 13-Agent Brain, creative DAM/rights, Approval, Publication, Synthetic Email and Learning owners through the browser. No shadow services or tables.
- Runs the existing disposable T1E signed OIDC issuer and user fixtures. No Entra/real social/email/AI provider accounts or production data.
- Reuses the canonical R3W Playwright evidence verifier plus same-run PostgreSQL application-role and no-provider preflights; does not convert CI evidence into independent 500-case acceptance.

## Five new Chromium scenarios
1. T17-001: separate signed maker/checker logins complete the actual offline brief→objective→workflow→13-agent→PNG/rights→campaign and creative approvals→inert social destination→sandbox publication→synthetic consent email→quarantined learning path, with zero real external effects.
2. T17-002: signed maker cannot self-approve; signed viewer cannot bypass creative permissions via BFF.
3. T17-003: signed foreign organization user cannot read or mutate another organization's campaign/brand using forged request inputs.
4. T17-004: signed independent checker approves before maker simulates consent-gated email, with zero real sends.
5. T17-005: signed browser logout revokes session; a stolen encrypted cookie cannot access campaign or publish APIs.

## Evidence and release limitations
The T1F checker requires **exactly five** separately executed passing Chromium cases with no skips, retries, duplicates or missing wall times, the exact source hash, same-run restricted PostgreSQL RLS proof, same-run no-real-provider staging preflight and T1E disposable staging config proof. It emits commit-bound engineering evidence only.

Observed test case wall time is NOT a production latency, p95, concurrency or SLO benchmark. Independent human 500-case signed QA remains **0**. The existing unsigned QA handoff and cryptographic production signoff policy are unchanged.

Persistent TLS staging server, separate real self-hosted IdP accounts, authorized human QA, network-level outbound firewall verification, genuine staging recovery, independent pentest, performance and accessibility testing remain external release prerequisites. Real providers remain disconnected.
