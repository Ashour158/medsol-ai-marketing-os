# Reliability & Recovery Contract

## Scope
The marketing OS uses command idempotency, transactional audit/outbox, durable workflow checkpoints, optimistic concurrency, approval-to-workflow linkage, and consumer inbox idempotency.

## Command safety
Every mutating command carries a tenant-scoped commandId. CommandReceipt is the authoritative replay guard. Replaying a completed command returns the stored response rather than mutating state again.

## Event safety
Every committed domain event is written to OutboxEvent in the same transaction as the authoritative mutation. The publisher claims unpublished records and records attempts/errors. Consumers use InboxEvent unique on organizationId + consumerName + eventId before executing business effects.

## Workflow safety
WorkflowExecution and WorkflowStepExecution are durable checkpoints. A completed step is never re-executed. A failed step can be retried. Underlying mutations are protected by deterministic command IDs so a checkpoint failure after a committed mutation is recoverable.

## Human authority
R2/R3 approval gates are explicit. Approval is linked to the waiting workflow. Approval rejection moves the workflow to BLOCKED; approval completion moves it to COMPLETED.

## Concurrency
Campaign transitions may require expectedVersion. A stale command fails with conflict rather than overwriting newer authoritative state.

## Recovery invariant
At any interruption point, recovery must choose one of three safe outcomes: replay a command through its receipt, resume a workflow from the last completed checkpoint, or replay an event through the consumer inbox guard. No recovery path may depend on a transient agent memory or chat transcript.

## Next production hardening
The current outbox publisher is transport-agnostic. Kafka delivery, dead-letter policy, lease expiry for abandoned claims, and operational retry/backoff are integration concerns to be added without changing authoritative domain contracts.
