# Agent Runtime v1

The runtime is the execution boundary for all AI employees.

Flow:
Agent Registry -> Agent Execution -> Agent Decision -> Policy Evaluation -> Approval Gate -> Application Command.

Agents are decision producers, not authoritative state owners.

Every execution receives tenant context, correlation/causation context and an explicit capability set. Executions are persisted with RUNNING/COMPLETED/BLOCKED/FAILED status.

The first concrete agents are CMO and Strategy. They intentionally use deterministic decision logic behind the same runtime interface; a ModelGateway can later be introduced without changing authority boundaries.

Runtime invariants:
- Unknown agents cannot execute.
- Duplicate agent registration is rejected.
- Missing capability is denied by policy.
- R4 cannot execute autonomously.
- Agent execution is persisted.
- Agent output is a decision payload, never a direct database mutation.

Next: durable workflow orchestration, model gateway, versioned prompts/policies, approval tasks, and outbox publication.