# Agent control plane — tranche 2

## Delivered
- Existing CI #183 was successful before this tranche.
- Agent runtime enforces manifest-owned capabilities, explicit grants, identity integrity, bounded JSON input/output, tenant and correlation metadata.
- Five deterministic agents are registered (CMO, Strategy, Analytics, Brand, Scientific). Scientific R3 decisions require human approval.
- Read-only agent operations endpoint provides tenant-filtered totals, status breakdown and recent execution references.
- Read-only execution detail endpoint exposes decision and provenance metadata without exposing raw input by default.
- Both operational endpoints are restricted to READ_AUDIT roles; viewer and general operator roles cannot read detailed traces.
- Next.js proxy route allowlist and authenticated workspace include an operations panel and per-execution trace inspection.
- Regression tests cover tenant scoping, denial to unauthorized roles, agent identity spoofing, unauthorized actions and malformed inputs.

## Remaining before autonomous agent execution
- Persist versioned agent manifests and execution grants; apply transactionally reserved per-tenant budgets before any paid model call.
- Build provider-independent model gateway with request timeouts, cancellation, structured output validation, token/cost accounting and prompt-injection defenses.
- Add durable execution leases and recovery rules; currently workflows reject RUNNING recovery without a lease.
- Implement all remaining agent capabilities against authoritative domain owners, and add cross-service event-driven workflows.
- Add connector-specific egress policy, credential vault, rate limits, telemetry, operational alerts and explicit human-approved publishing.
- Entra remains deferred; no production authentication bypass is permitted.

## Security invariants
Agent output is a proposal, never an instruction with authority. Read operations are tenant-scoped. Publishing and scientific claims must pass policy and human review. All development without Entra must remain in isolated nonproduction environments.
