# R2C-C — Provider account observation (no live publishing)

## Reuse Map
- **IntegrationConnection / PlatformIntegrationHubService** remains the canonical registered destination and health read model.
- **ProviderCredential / IntegrationOAuthLifecycleService / ProviderSecretEnvelope** remain the only credential, OAuth exchange and encryption owners. Existing tokens are never written into observation rows or audit.
- **ProviderAccountObservationService** is a child evidence use case only; it is not an integration registry, independent OAuth provider, sending engine, second approval authority or agent framework.
- **CampaignPublicationService** remains the sole authoritative publication-intent and preflight authority, permanently declining external effects at this stage.
- Existing **AuditEvent**, PostgreSQL tenant context, role guards and **Outbox/Inbox** remain unchanged.

## New server-only flow
1. Verify matching tenant, pending destination and existing unrevoked encrypted credential.
2. Decrypt the access token server-side using the tenant+connection+purpose-bound vault envelope.
3. Run a deployment-managed, **read-only** account introspection adapter **outside** the database transaction. This implementation ships **no live provider adapter**; no HTTP route accepts arbitrary access tokens or introspection results.
4. Verify returned provider key, bounded opaque account reference, provider request identifier, scope subset of the stored OAuth token and allowlisted capability names. Reject unexpected scopes, duplicate capability assertions and changed connection/credential states.
5. Create one immutable, SHA-256-referenced observation per exact credential with a maximum ten-minute freshness window, restricted by token expiry. Store only non-secret metadata and an audit event. No automatic retry of remote calls or token refresh.
6. Health and canonical publication preflight expose **observed** and **fresh** separately from customer destination binding, actual ownership verification and publication capability. All external effect flags stay false.

## PostgreSQL and governance
- Additive migration with tenant-specific composite FKs, credential/provider/connection provenance trigger, immutable evidence fields, one-way revocation, no SQL deletes and FORCE row-level security.
- Observation does not become trusted merely by its existence. It cannot bind the provider account to an authorized customer destination, authorize posting, certify scope or permissions, or prove a signed provider receipt.
- Revoked/expired credential, suspended/revoked connection, revoked/expired observation or foreign tenant means not fresh. Historical evidence remains audit-only.
- A new OAuth credential requires a governed new connection, rather than overwriting encrypted tokens or reusing an observation.

## Test contract
A real PostgreSQL test exercises one-use OAuth token flow, exact tenant/provider checks, malformed/unapproved scopes and capabilities, read-only adapter invocation, immutable evidence and no token leakage, permanent observation revocation, non-BYPASSRLS tenant switching and pooled-context reset. This evidence is not equivalent to a live provider staging test.

## Release blockers
Live provider OAuth authorization/callback adapters and user consent, actual provider account ownership and destination binding, certified capability readback against the current provider API, KMS key rotation, real cloud media storage, signed provider callback/receipt verification, human release gates and consent/suppression, commercial tenancy and security UAT remain outstanding. CI verification must pass before merging. **No external sends are authorized.**
