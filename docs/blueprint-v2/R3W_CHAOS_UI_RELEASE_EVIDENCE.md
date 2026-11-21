# R3-W — Fail-Closed Application UI, Offline Fault Recovery and Verified Browser Evidence

**Date:** 21 November 2026. **Release verdict: NOT_CERTIFIED.** This is executable local-only UI chaos/role acceptance atop the R3-V Chromium suite. The real PostgreSQL integration tests and tenant FORCE RLS gate remain separately exercised. No Entra account, AI provider, MCP credential, customer email, real publishing or production data are used.

## Reuse Map

| Concept | Existing authoritative owner | R3-W extension |
| --- | --- | --- |
| Browser and routing | OfflineCampaignJourneyStudio; encrypted-session Next marketing BFF | Fail-closed stale-campaign state, verified creative readback, precise error messages and 34 browser cases |
| Agent execution and workflow | MarketingWorkflowService; BrainRunLedgerService; BrainRunExecutorService | Fault injection against browser fixture only; no implicit replay of uncertain executions |
| Creative and approval | CreativeAssetService; VerifiedMediaEvidenceService; ApprovalService | Clear old campaign scope on switching; verify exact revision/digest and offline PNG origin before exposing approval affordance |
| Virtual social and consent email | CampaignPublicationService; SyntheticAudienceEmailService | Denial, failure/retry, consent withdrawal and zero real deliveries; never a duplicate transport |
| Operational readiness | Existing read-only MarketingCommandCenterService, R3-J recovery view | Show NOT_CERTIFIED, unsigned evidence, no automatic recovery |
| Evidence | Single R3-L acceptance index and existing detached Ed25519 verifier | Verify actual Playwright JSON execution results; reject skipped, retried, failed, duplicate or unexpected tests |

## Implemented UI and chaos coverage

A typed campaign lookup is separate from the confirmed loaded campaign ID. Loading another campaign clears prior creative, preview, approval, publication, synthetic recipient and destination UI state. Failed lookup does not silently retarget the current campaign. The loaded campaign ID and name are displayed explicitly.

An offline PNG remains unapprovable until canonical server-side readback and preview both succeed and the returned revision ID, raster digest, offline-only origin and image PNG data URI agree. Server-side rights and scope approvals remain authoritative.

The Chromium test fixture listens only on loopback, uses fresh local HTTPS certificates, and exercises the real Next encrypted Host Secure cookie and BFF. A bounded, one-shot test-only fault controller simulates upstream failures and disconnects. It adds a test-only state snapshot, synthetic session revocation, mock consent opt-out and unsigned read-only recovery state. The fixture has no external provider egress or production imports.

The new R3-W browser suite adds 34 cases to the existing 17: session tampering, expiry and replay; wrong-tenant and wrong-campaign reads; viewer mutations; workflow rate limiting/503/disconnection and manual retry; uncertain brain run without auto replay; quarantined learning; inert provider metadata; creator self-review denial; simulated social failure/retry and no ROI claims; mock email consent/withdrawal and zero sends; creative upload/readback/digest failures; unverified scientific claims; read-only release gates and recovery; fail-closed audit outages.

## CI execution-proof gate

The Playwright runner writes a machine-readable report. scripts/quality/r3w-browser-evidence.mjs requires all **51 actual browser cases** to execute and pass exactly once, with no skipped, flaky, failed, duplicate or unexpected scenarios. Its CI-only manifest includes current GitHub run ID plus SHA-256 of the report and browser source files. The one canonical 500-slot acceptance index requires that exact same-run manifest and the existing PostgreSQL RLS census before classifying engineering results as CI_ASSERTED.

**After green CI:** 228 of 500 planned slots are backed by engineering assertions: 123 offline/BFF, 54 real PostgreSQL, 51 actual Chromium. **272 are unmapped; 0 have independent executed/signed staging E2E acceptance.** No test artifact creates operator certification.

## Non-negotiable production blockers

Independent 500-case production-like staging E2E and cryptographic operator signoff; independent penetration test; least-privileged production role and tenant isolation; genuine Entra rollout and rotation; deployed PITR/RTO/RPO; independent accessibility and operational drills; eventual expressly authorized provider staging UAT. No real provider or outbound delivery may be implicitly enabled.

**Production release remains NOT_CERTIFIED.**
