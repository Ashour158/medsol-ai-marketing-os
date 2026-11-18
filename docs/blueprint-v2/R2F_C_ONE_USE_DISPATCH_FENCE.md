# R2F-C — Durable one-use dispatch denial fence and official-provider adapter port

**Actual delivered scope:** A one-use, idempotent, append-only, *non-dispatchable* operator release hold in the existing PublicationAttempt authority, plus a strictly locked provider-neutral official-adapter interface. This is not an authorized remote send reservation. **No live social publishing or provider HTTP requests are enabled.**

## Blueprint Reuse Map (mandatory)

| Business concept | Existing authoritative owner | R2F-C implementation |
|---|---|---|
| Publication intent, lifecycle and attempts | CampaignPublicationService / CampaignPublication / PublicationAttempt | Extend the authoritative attempt ledger with a one-use RELEASE_FENCE that blocks the same publication atomically; no second receipt/attempt store |
| Human and creative approvals | Existing ApprovalService, CampaignService, CreativeAssetService | Not duplicated or overridden; R2F-B exact approval schedule remains intact |
| Human tenant identity and permission | Existing OIDC BootstrapAuthGuard, User and TenantRolePolicyService | Admin-only MANAGE_TENANT permission, fresh matching OIDC subject, verified active DB user, tenant-specific resource |
| Provider and OAuth ownership | Existing PlatformIntegrationHubService / IntegrationConnection | Define the official provider adapter port; do not add a second provider registry, credential record or claim account ownership |
| Durable internal event transport | Existing OutboxEvent / OutboxService | Exactly one audit and one internal dispatch-held outbox event in the same serializable transaction |
| Audit | Existing AuditEvent | Human-actor, rationale, attempt ID, exact digest and explicit no-send flag |
| Human console and BFF | Existing Publication Studio, exact Next.js route allowlist | Explicit permanent hold with clear warning; never expose publish or unlock routes |
| Provider notification and reconciliation | Existing ProviderWebhookEvidenceService and CampaignPublicationService.reconcileProviderDelivery | Count RELEASE_FENCE separately from real REMOTE attempts; no false delivery from a signed webhook, sandbox or hold |

## Durable idempotent denial state machine

`PREPARED + active tenant OIDC administrator + exact expectedVersion + requestKey + rationale`
→ **serializable transaction**
→ append unique immutable `PublicationAttempt(mode=RELEASE_FENCE,outcome=BLOCKED,sequence=1)`
→ CAS `CampaignPublication(PREPARED→BLOCKED,version+1)`
→ one AuditEvent and internal OutboxEvent
→ **NO EXTERNAL SEND**.

- The idempotency key is not stored raw. The stable `internal:release-fence/<sha256>` reference is derived from domain-separated tenant/publication/key input.
- Same key returns the *same* attempt as a replay. A different key cannot attach a second fence, and one new fence per publication is enforced by a PostgreSQL partial unique index.
- A concurrent worker losing the transaction attempts to read the already committed matching fence. Any incompatible conflict or still-unsettled serialization is reported as a conflict. No blind provider retry is possible because there is no provider call in this state machine.
- A blocked publication is deliberately **irreversible** in this tranche: its immutable scope cannot be updated to unblock it; to resume work the business must prepare a new exact approval and publication. This is a safety operation, not a recovery/retry permission.
- The database explicitly allows only `SANDBOX` and `RELEASE_FENCE` modes. `REMOTE` remains prohibited, along with `PUBLISHED` status; existing FORCE tenant RLS, append-only triggers and immutable publication identity remain in force.
- New SQL triggers require a current PREPARED publication, matching original approved scope digest and sequence 1 before any RELEASE_FENCE can be inserted. DB owner cannot rewrite or delete evidence; all rows are confined to the tenant transaction context. Existing sandbox behavior is retained.

## Provider-neutral integration contract

`OfficialSocialPublishingAdapter` supports a provider-specific official capability inspection, strongly typed remote publish observation and independent remote-post readback, as a **port only** owned by the Integration Hub's provider integration layer. It does not contain an actual vendor network adapter or active credentials.

`LockedOfficialProviderDispatchGateway.publish` always refuses before calling the adapter. Tests inject a fake Meta provider that claims capabilities, a successful HTTP response and a forged permit; the call count for provider capability, publish and readback remains **zero**. TypeScript nominal branding alone is not treated as runtime security.

Potential future validated adapters must integrate exclusively through the canonical CampaignPublicationService and its separately approved durable REMOTE attempt state, official provider app verification, tenant/customer ownership, exact last-mile approval, entitlement, audience consent, operator unlock/kill switch and staging. Do **not** extend this lock by introducing a direct agent-side HTTP client.

## Critical distinction: durable hold vs dispatch reservation

R2F-C implements a **durable non-dispatchable hold**, not a usable outbound reservation. A true authorized `REMOTE` reservation would require committing an externally eligible attempt *before* egress, with a single-use lease/idempotency contract, official provider-owned request ID, true business authorization, and a crash-ambiguous `OUTCOME_UNKNOWN` state. Those controls are not yet satisfied. The system does **not** claim that a non-dispatchable hold fulfills a real provider attempt's authorization requirements.

`CampaignPublicationService.reconcileProviderDelivery` counts only true mode `REMOTE` (which SQL currently forbids), and reports a release fence separately. No hold, sandbox attempt or signed inbound event can fabricate a delivered post. Ambiguous external outcomes will stay `OUTCOME_UNKNOWN` without blind retries once a true adapter exists.

## Tests / review gates

- Real PostgreSQL: prepare an additional tenant publication, reject a forged cross-scope SQL fence, OIDC/role/cross-tenant denial, race two holds, exact same-key replay, different-key conflict, exactly one attempt, exactly one audit and internal outbox event.
- SQL: deny real REMOTE mode, deny mutation and deletion of fence, enforce immutable scope and current PREPARED state.
- Existing publication: sandbox still simulates exactly once, held publication cannot be simulated or externally sent, and source reconciliation returns zero authorized remote attempts.
- API: only the admin-scoped `POST /marketing/publications/:id/dispatch-hold` is allowed; unauthenticated/agent/bootstrap paths remain denied, and `POST /dispatch` or `POST /publish` remain absent.
- Port fake-adapter tests: even a forged all-true permit cannot reach provider publish or GET.
- Full CI: TS, clean and historical DB migration, Prisma drift, PostgreSQL integration, UI build, security evidence and SBOM.

## External prerequisites / R2F-D

Production live publishing remains contingent on real provider app review/consented scopes, tenant/customer destination ownership, global IAM and entitlement/agency authority, compliant audience/region policy, current rights/malware and exact approval, authorized live `REMOTE` attempt ledger + leases/reconciliation, webhook+provider GET verification, operator kill switches, rate limits and complete staging acceptance. No environment flag, model output or mock response should bypass these.

**Release classification: R2F-C durable non-dispatchable hold and adapter boundary delivered, live-provider publishing NOT delivered.**
