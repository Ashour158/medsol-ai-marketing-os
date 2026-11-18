# R2F-A — Governed external publishing release policy and non-bypassable dispatch barrier

**Status: implemented as a fail-closed policy/diagnostic slice. LIVE PUBLISHING IS NOT IMPLEMENTED OR ENABLED.** Existing provider credentials and account observations are pending, and commercial entitlements, customer ownership, official app review, audience consent, globally enforced IAM/RLS and genuine provider staging have not been established.

## Reuse Map — mandatory blueprint rule

| Concept | Authoritative existing owner | R2F-A implementation |
| --- | --- | --- |
| Brand/campaign/rights/approval | CampaignService; BrandMasterService; CreativeAssetService; ApprovalService | Call existing CampaignPublicationService.check on every assessment; never create another approval ledger |
| Immutable publication intent / attempts | CampaignPublicationService, CampaignPublication, PublicationAttempt | Add read-only releaseReadiness and absolute backend dispatch denial; SANDBOX-only SQL and no PUBLISHED preserved |
| Policy engine | @medsol/policy / authorizeCommercialScope | Add strict evaluateSocialPublishingRelease as AND prerequisite; invoke canonical commercial scope authorizer from server evidence, never user booleans |
| Provider and OAuth | IntegrationConnection, ProviderCredential, ProviderAccountObservation, OAuth lifecycle | Read tenant-connection-bound encrypted credential status and read-only observation; pending tokens **not** verified publishing permission |
| Media/source provenance | CreativeAssetRevision, VerifiedMediaEvidence, R2D storage | Require unchanged actual readback digest, object version and CLEAN immutable malware scan before considering release |
| Tenant identity and roles | BootstrapAuthGuard, verified OIDC subject, User, TenantRolePolicyService | Require actual active OIDC user and role; no bootstrap/agent permission escalation |
| Transport & reliable events | Existing OutboxEvent, InboxEvent, R2E-A signed callbacks | No second outbox or worker; future provider attempt must use PublicationAttempt and Inbox reconciliation |
| UI/operations | Campaign Publication Studio, Nest authenticated API, Next BFF | Add authenticated READ_AUDIT-only release-readiness report with no external POST command |

## Twenty-three conjunctive release prerequisites

1. Verified human identity and active scoped user/role.
2. Real tenant subscription entitlement and valid delegated agency authority where applicable.
3. Tenant/brand active, current independent exact approval, unchanged campaign/creative and reviewed rights.
4. Same exact approved destination, CLEAN immutable media proof and current object version.
5. Official provider app review, fresh backend-managed credentials, officially confirmed scopes/capabilities, authentic provider account ownership and customer destination binding.
6. Approved data region/purpose, permitted audience consent or verified no-targeting policy, active publication schedule and approval at actual send time.
7. No tenant/brand emergency hold, explicit operator-signed egress release, no existing/unknown dispatch, and no provider/platform kill switch.

These are individually named and default-denied in `@medsol/policy`. A pure policy outcome with every check true is **still not an external send authorization**: independently approved connector implementation and an atomic durable dispatch claim remain required.

## Server-side release logic

`CampaignPublicationService.releaseReadiness(org, verifiedOidcIdentity, publicationId)`:
- Enforces transaction-local PostgreSQL tenant scope and exact authenticated OIDC identity-to-User subject matching.
- Uses current canonical preflight to check brand master, approved campaign, independent rights and maker-checker approval, exact content/source digest, approved destination, media expiry and current revision.
- Checks tenant+connection credential freshness and observation consistency only as *diagnostic evidence*. Pending credentials and observed accounts do not become approved.
- Connects existing `authorizeCommercialScope(APPROVED_PUBLISH)`; because no production subscription, tenant-publishing entitlement or provider eligibility authority is connected, this check is intentionally DENY. No client or model can supply missing server truth.
- Leaves provider app review, verified provider scope, customer destination binding, consent proof, regional suitability, platform emergency hold and operator unlock FALSE; no env flag flips these values.
- Returns a clear operator report with named blockers, no provider credential material, no raw account IDs, zero provider egress and `externalEffectsAuthorized=false`.
- `assertExternalDispatchBlocked` is a backend-only absolute denial and does not invoke a provider API. No publish POST route exists. The existing database's `PublicationAttempt` remains SANDBOX only and `CampaignPublication` cannot be set to PUBLISHED.

**Known schedule blocker found during blueprint check:** current R2 sandbox approval fixtures allow a scope where approval expiry precedes scheduled release. Actual external release must not reuse that contract as live-safe: R2F adds `scheduleWithinApprovedWindow` requiring the scheduled time to fall before approval expiry, without silently changing the historical sandbox workflow. A future exact-scope policy migration, explicit approval updates, staged regression and human sign-off must resolve this before sending.

## Provider ambiguity contract

`classifyUnreconciledProviderDispatch` classifies any unconfirmed provider HTTP response (including HTTP 2xx), timeout, network error or signed callback as `OUTCOME_UNKNOWN`; it *never* authorizes automatic replay or treats a callback as proof of delivery. A denied preflight is `BLOCKED` before a network call. A future provider readback must prove the remote post is bound to the exact authorization, destination, content/version and immutable attempt before PUBLISHED can be introduced.

## Tested behavior

- Every one of 23 release evidence items missing, false, omitted or supplied as the string `"true"` blocks an external action. Even an all-true pure prerequisite set does not grant send permission.
- All ambiguous future transport outcomes remain UNKNOWN with no blind retries.
- Real PostgreSQL approved campaign and independent creative approval still cannot dispatch: missing subscription, provider app review, customer ownership, clean scan and schedule are reported. Cross-tenant subject spoofing fails or remains denied.
- No release assessment inserts a real PublicationAttempt, sends provider requests or produces invented metrics.
- Existing UI has read-only release diagnostics; BFF and API expose only GET with READ_AUDIT; POST /publish remains unsupported.
- Existing R2/R2C/R2D/R2E migrations, RLS and immutable source proofs are untouched.

## Real R2F-B / R2F-C operator-dependent completion gates

Before outbound code can be activated safely:
1. Implement a provider-specific **official, tested and approved** backend publish adapter with restricted host/capabilities; complete account review and OAuth scope consent and prove authenticated tenant-owned destination binding.
2. Finish verified multi-tenant OIDC/ABAC, subscription entitlements and agency delegation for live action, lawful audience/consent and region policy, private storage delivery and platform incident/kill-switch authority.
3. Correct and reapprove the exact schedule/approval-expiry semantics; prove atomic publication attempt reservation and one-use idempotency across process crashes, leases, long calls, revocation and concurrent workers, with no retry on uncertain egress.
4. Record provider acknowledged/unknown state in the *existing* PublicationAttempt authority, reconcile an independent authenticated official provider GET/post readback plus signed webhook with exact account, content, destination and attempt. Only then design SQL PUBLISHED and signed RemoteReceipt transitions.
5. Complete vendor staging using actual approved credentials, malicious/expired credentials, network failures and webhook replays, two-tenant and agency revoke, security testing, emergency stop, disaster recovery, operations approval, customer UAT and legal release.

Do not convert **R2F-A implemented** into **R2F live publishing complete** until every gate is verified in operational staging. This tranche intentionally makes unsafe live activation impossible.

**R2F-B follow-up:** The incorrect expiry-before-scheduled-release contract is corrected in the canonical ExactCreativeScope validator, CreativeAssetService, ApprovalService, publication preflight and release-readiness. New approvals must remain valid for more than five minutes after scheduled execution. Earlier incompatible approvals remain immutable historical evidence and are invalid for release. [Implementation and acceptance](R2F_B_EXACT_APPROVAL_EXECUTION_WINDOW.md).
