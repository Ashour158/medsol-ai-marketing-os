# R2E-A — Meta signed webhook verification and quarantined evidence

**Scope:** Back-end, provider-specific signature verification + idempotent notification evidence. This is **not** actual provider delivery receipt reconciliation, not a live callback endpoint and not permission to publish.

## Reuse Map

| Business concept | Canonical owner | R2E-A extension |
| --- | --- | --- |
| Provider and brand identity | IntegrationConnection / PlatformIntegrationHubService | Exact provider+tenant+connection matching, read-only status count |
| Event transport and replay fence | InboxEvent | Existing composite organization+consumer+eventId uniqueness; atomic with evidence |
| Signed provider source evidence | ProviderWebhookObservation | One quarantined append-only child observation per tenant+connection+body digest |
| Audit | AuditEvent | One safe metadata event per accepted distinct payload, no raw body, key or signature |
| Publication and external delivery | CampaignPublicationService / PublicationAttempt | Unchanged; synthetic sandbox only and live effects remain false |
| OAuth and tokens | ProviderCredential / ProviderSecretEnvelope | No tokens or secrets are read or modified by signed callback observation |

## Meta verification
Meta documents an `X-Hub-Signature-256` header containing `sha256=` followed by a SHA-256 HMAC of the *exact raw notification body* using the app secret (Meta Graph Webhooks documentation: https://developers.facebook.com/docs/graph-api/webhooks/getting-started/).

R2E-A checks a bounded raw byte payload (2–262144 bytes), requires a deployment-resolved per-connection secret, uses Node crypto HMAC-SHA256 and constant-time equality, then parses a signed JSON event with allowed `object=page` or `object=instagram` and 1–100 entries. It rejects unsigned/malformed payloads, wrong secret, changed bytes and unsupported event classes.

A valid signature proves only that the payload matches the configured shared secret. It does NOT prove which customer owns the provider account, that the post was created by Medsol OS, that the requested destination is bound, or that an outbound publication attempt succeeded. Meta app secrets can be shared across subscriptions: provider account binding requires independent verification.

## Reliable quarantine
`ProviderWebhookEvidenceService.ingestMeta` is **server-only**, with **no public route in this tranche**:
1. Confirm tenant-scoped pending Meta connection.
2. Resolve secret outside the DB transaction from deployment secret manager.
3. Verify exact signature and strict event shape before storing anything.
4. Inside one serializable tenant-scoped transaction revalidate the connection, create an immutable ProviderWebhookObservation and existing InboxEvent key, and create an AuditEvent.
5. Retries with identical signed bytes return `replayed=true`; concurrent same-payload inserts are deduplicated by unique tenant+connection+payload digest.
6. Health reports `signedWebhooksQuarantined` and `remoteDeliveryReceiptsVerified=0`, explicitly not readiness or delivery proof.

Observed events stay `QUARANTINED` in SQL, with append-only update/delete prohibition even for the database owner and FORCE PostgreSQL tenant RLS.

## Tests
- Known-good raw HMAC, wrong secret, tampered bytes, malformed signature, invalid JSON, unsupported event type, oversize and missing app secret.
- Real PostgreSQL tenant isolation, foreign connection rejection, signature-before-inbox, exact duplicate replay, immutable evidence and no raw payload/secret leakage in audit, revocation fence.
- Non-BYPASSRLS role test: no tenant 0, correct tenant 1, foreign tenant 0 and pooled transaction context resets.
- Public route negative regression confirms no unguarded webhook or remote-receipt endpoint is registered.

## External release gates
- Configure provider App Secret in a managed per-connection secret resolver and approved callback transport preserving raw bytes; no client-supplied endpoint or secret.
- Configure Meta callback verification challenge and exact subscription, replay/rotation policies, TLS, rate controls and operator monitoring.
- Bind provider account ownership and external destination independently to the tenant's Connection.
- Capture a genuine authorized outbound dispatch ID/remote post ID, validate provider receipt semantics, and reconcile against exact campaign publication and human approval.
- Add actual provider staging tests and platform-specific signed receipt adapters. No outbound posting, user-facing webhook endpoint or remote success state exists in R2E-A.

**Do not interpret quarantine or any signed notification as a published post.**
