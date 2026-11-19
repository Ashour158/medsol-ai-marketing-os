# R3-E — Signed tenant-owned MCP/A2A metadata registry (no external calls)

## Mandatory Reuse Map
| Concept | Authoritative owner | Extension |
|---|---|---|
| Canonical agent identity | `AGENT_ROSTER`, `AgentService` | No new agents or autonomous tool permissions |
| Workflow | `MarketingWorkflowService`, `WorkflowExecution` | No second executor or tool step authority |
| Integrations | `PlatformIntegrationHubService` for social account connection/credential | New bounded **GovernedToolRegistration** only for MCP/A2A signed tool/peer metadata, not a social connection or a token store |
| IAM | Existing OIDC User and MANAGE_TENANT permission | Active exact subject and role rechecked for each operation, separate creator/reviewer |
| Audit and events | Existing AuditEvent and OutboxEvent | Registry approval and revocation use canonical audit/outbox |
| Data isolation | Existing tenant-scoped PostgreSQL transaction convention | New registry table with FORCE RLS and SQL transition guard |
| Model routing and budget | `GovernedModelService`, `ModelBudgetService` | No direct tool invocation, model calls or billing |

## Delivered
- Strict typed metadata for MCP/A2A; trust T0–T3, declared tool and scope allowlists, bounded response and timeout budgets, data class and write flags.
- HTTPS public-host origin metadata only for remote tiers. No credentials, private IP/localhost/ports/paths. **Metadata validation is not DNS-rebinding-safe network validation**; therefore no remote network invocation is implemented or authorized.
- Canonical SHA256 manifest digest, separate Ed25519 trusted signer from server environment, signer key ID, maker-checker human approval, permanent revocation and immutable manifest content.
- Tenant-owned registration API: `GET/POST /marketing/tools/registrations`, `POST .../:id/approve`, `POST .../:id/revoke`, `POST .../:id/inspect`. No execute, connect or dispatch endpoint.
- The inspector always reports `remoteExecutionAuthorized:false`, `mcpCalls:0`, `a2aCalls:0`, `externalEffectsAuthorized:false` regardless of metadata approval or trust tier.
- SQL lifecycle and FORCE RLS, including immutable signed metadata, no deleted records, terminal revocation, independent reviewer, version CAS. PostgreSQL test checks cross-tenant RLS using an unprivileged role, OIDC subject forgery, signature, tampering, idempotency and audit/outbox.

## Explicit non-completion
This is a durable governed **registry** and signing foundation, not a production MCP client, A2A agent transport, DNS-safe egress gateway, credential vault, schema-validated remote execution, tool response quarantine or full R3. No real tool server or account has been connected. R3 must not be certified complete on this evidence.
