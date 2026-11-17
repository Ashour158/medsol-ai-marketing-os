# Executable Vertical Slice v1

Request -> CMO -> Strategy -> Policy -> Campaign Service -> Audit + Outbox -> Approval when required -> Human decision -> authoritative transition.

Rules:
- Controllers validate and dispatch; they do not own business state.
- Agents propose decisions; application/domain services mutate authoritative state.
- Every command has commandId and correlationId.
- Duplicate commands return the original receipt.
- Material mutations write audit and outbox records in the same transaction.
- Tenant scope is mandatory on authoritative queries.
- Approval uses generic object references, never polymorphic foreign keys.

Next hardening: durable outbox publisher, Temporal workflows, optimistic concurrency, authentication/authorization, observability, integration contract tests, policy versioning.