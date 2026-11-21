# T2B — Server-validated canonical agent signing packet

**21 November 2026.** Offline engineering improvement; production remains **NOT_CERTIFIED**.

## Reuse Map
- Existing `AgentManifestReleaseService` remains the sole release authority: canonical parser, deterministic SHA-256 digest, trusted Ed25519 verifier, versioned history, maker/checker, tenant transaction and rollback.
- `BootstrapAuthGuard` plus the one permission registry restricts the preview endpoint to an active tenant OIDC administrator. Next BFF continues to enforce same-origin requests and its existing protected session.
- Browser-side preview is convenience only. Propose/approve/activate still validate canonical signatures and tenant authority on the server.

## Delivered
- Admin-only read-only transaction behind `POST /marketing/agents/manifests/preview` returns strictly validated canonical manifest, digest and precise Ed25519 UTF-8 payload for separate offline signing.
- The UI invalidates the preview and pasted detached signature whenever the draft or chosen agent changes. Proposals submit server-canonicalized manifest bytes, not a separate unvalidated client serialization.
- No private key, new agent owner, provider credentials, remote model permission, external effect or direct publishing path is introduced.
- Exhaustive API/BFF route-count tests, negative safety/digest test and signed-manifest tests updated.

## Remaining acceptance
CI TypeScript, exact authorization inventory, repository tests, Chromium, real PostgreSQL/Next/Nest/JWKS acceptance, RLS and offline staging preflight must pass. Real staging deployment, independent 500-case signoff, full agent factory, provider UAT and production certification remain open.
