# Tranche 1A — Live application readiness and operator evidence

**Started 21 November 2026.** This is the first implemented vertical slice of the accelerated completion sprint, **not** completion of T1 or the whole blueprint. Production decision remains **NOT_CERTIFIED**.

## Reuse Map

- Keep the **existing** Nest `AppController`, global `BootstrapAuthGuard`, `PrismaService`, and `assertRuntimeDatabaseRole`; do not add an alternative authentication or tenant authority.
- Keep the **existing** Next BFF and real API URL. A separate public `/api/health` reports aggregate liveness only; never expose tenant data, credentials, OIDC tokens or PostgreSQL role names.
- Use the **existing** R3-Y compiled-Nest/real-Postgres/real-Chromium CI topology, replacing API readiness startup polling with a live role query. Do not count these probes as new independent operator acceptance cases.

## What changes

- `GET /health` remains the shallow process-liveness endpoint.
- `GET /readyz` queries PostgreSQL **now**, fails with HTTP 503 if the connection or production runtime-role check fails, and cannot mistake an unprivileged database role for a superuser/bypass role.
- `GET /api/health` on the frontend probes the compiled backend and returns HTTP 503 if the backend fails; neither endpoint claims independent security certification, provider availability or production readiness.
- R3-Y browser stack startup now requires the real Nest `/readyz` probe instead of a static `/health` response.
- Tests cover live-role predicate, privilege denial, role absence, backend success and 503 paths.

## Still blocked

A persistent externally reachable staging deployment, local-operator sign-in without real Entra, a tenant-independent multi-organization authentication entry point, independent tester signoff, secure staging secrets, production backups and genuine provider UAT are **not** accomplished by the probes. Keep all provider effects disabled and do not describe a GitHub ephemeral stack as permanent staging.
