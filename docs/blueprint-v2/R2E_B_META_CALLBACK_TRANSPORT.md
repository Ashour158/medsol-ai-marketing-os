# R2E-B — Isolated Meta webhook callback transport

**Status:** server-side callback composition implemented, real provider App Secret and reverse-proxy deployment NOT configured. All signed POST events remain QUARANTINED. This is not a live publishing pipeline.

## Reuse Map
- `PlatformIntegrationHubService`/`IntegrationConnection`: authoritative provider+tenant connection mapping.
- `ProviderWebhookEvidenceService`: authoritative verified-notification ingestion (R2E-A), sole side-effect handler for POST callbacks.
- `InboxEvent`: single deduplication authority, scoped by tenant+connection+raw-body hash.
- `AuditEvent`: canonical security event record; raw payload, verify token, app secret, and signature are never included.
- `CampaignPublicationService`: remains the only publication-intent owner and continues to deny live provider send.
- `MetaWebhookIngress`: bounded HTTP transport only. No new approval, scheduling, publishing, tenant IAM, provider integration or receipt ledger.

## Contract
1. A separate, isolated Node callback server is assembled explicitly with `buildMetaWebhookRuntime`. It does not amend NestJS authenticated marketing routes or create a public endpoint on application startup.
2. Deployment supplies exact `/hooks/meta/<unguessable>` paths mapped to immutable tenant/connection IDs, a distinct GET verification token per path, and a tenant+connection secret resolver for the Meta App Secret. Config cannot be derived from client parameters, request headers or agent plans.
3. GET accepts only one each of Meta's `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge`; uses constant-time token comparison, rejects duplicates and malformed/extra query values, and echoes the challenge only on success.
4. POST requires exact configured route, no query parameters, JSON content type, a single `x-hub-signature-256` header, a bounded 256 KiB raw payload and controlled transfer encoding. It forwards raw bytes without reserializing JSON to R2E-A HMAC-SHA256 verification and serializable evidence/inbox transaction.
5. Duplicate signed bytes return idempotent HTTP 200. Unapproved challenges/signatures return generic 403; invalid types 415, bad inputs 400/413, unknown paths 404, unsupported methods 405; transient backend failures return generic retryable 503.
6. Responses contain only receipt quarantine status, not external delivery confirmations. No raw payload or secret is returned, stored in WebhookObservation or included in audit.

## Required deployment topology
- A dedicated publicly reachable HTTPS reverse proxy endpoint, routing ONLY `/hooks/meta/<opaque>` to the isolated callback process. Keep the main API/Next.js BFF OIDC-only.
- TLS 1.2+, strict public endpoint controls, provider-specific rate limits, denial of direct internal port access, safe reverse-proxy body size/timeouts, and disabled URL query logging for GET challenges.
- Managed per-connection secrets, rotation and least-privilege access to tenant-scoped database operations; unique callback path and verify token for each configured subscription.
- Host/proxy request logging must remove `hub.verify_token`, signature headers, full POST bodies and connection secrets. The in-process handler does not log those values.
- Deployment must provide resource bounds and monitoring for rejected signatures, retries, timeouts, callback errors and quarantined event spikes; ingestion must not be an unbounded queue.
- Callback subscription/account ownership must be verified against provider dashboards and provider APIs. A known URL plus valid app secret does **not** establish user authorization.

## CI contract
- HTTP tests: success and invalid GET handshakes, duplicates, unknown paths/methods, raw POST signed acceptance, modified payload rejection, incorrect MIME, failed backend retry outcome, spoofed tenant header ignored, and duplicate config rejection.
- R2E-A PostgreSQL tests continue to verify tenant isolation, immutable stored evidence, replay, independent subscription deduplication and sensitive-data minimization.
- Clean/historical database migration, schema drift, workspace typecheck/test/build and SBOM/audit jobs must all pass.

## Remaining before actual provider operation
Deployment configuration, Meta app registration and webhook subscription validation, real app secrets from a secure manager, actual provider account ownership and destination binding, signed provider receipt semantics, correlation to an authorized outbound delivery, permission-approved publication, retry/backpressure infrastructure and staging integration tests.

**No live publishing capability or provider receipt reconciliation is enabled by R2E-B.**
