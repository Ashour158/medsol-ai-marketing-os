# Agent/OS phase 1 — safe development without Microsoft Entra

## Decision
Microsoft Entra tenant configuration is deferred. Do **not** disable production OIDC requirements, bypass identity guards, provision fake trusted principals, or allow unauthenticated publishing. Use isolated local/test environments with disposable data only. Existing bootstrap mode remains limited to its existing read-only policy. Development can continue via unit/integration tests and deterministic service execution without live SSO.

## Delivered
- Agent runtime enforces roster ownership of the action, explicit per-execution capability grants, agent ID consistency, bounded JSON input and output, and mandatory tenant/correlation metadata.
- Three additional deterministic agents are registered: analytics measurement-plan draft, brand review gate and scientific evidence/compliance gate. They produce advisory drafts, not externally published content or verified scientific claims.
- R3 scientific review remains human-approved. No direct social publishing, external communications or customer-data mutations are introduced.
- Regression tests cover action spoofing, missing grants, forged identity, oversized and cyclic input, unknown agent IDs, and R3 human approval.

## OS build sequence
1. Agent control plane: versioned manifests, execution grants, immutable trace, budget and model gateway; enforce output schema and timeout at each execution boundary.
2. Workflow orchestration: leases, retries, idempotent recovery, durable step execution and manual approval queue.
3. Domain capabilities: product marketing, content, scientific evidence, brand, events, analytics, growth and CRM; no shadow ownership of campaign state.
4. UX: agent roster, execution details, policy denials, approvals, activity feed, budget telemetry and operational dashboards.
5. Integrations: provider-specific connectors, least-privilege scopes, sandbox testing and audited publication gates.
6. Final production gates: configure Entra, test live SSO and revocation, perform browser E2E and security review.

## Acceptance rules
No external publication without authorized human approval. Agent outputs are untrusted proposals. Scientific claims require evidence and compliance review. CI green is a code-quality gate, not proof of deployment security.
