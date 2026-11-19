# R2-I + R3-C — no-account email delivery simulation and governed multi-provider model routing

## Mandatory Reuse Map
| Business concept | Canonical owner | Extension |
|---|---|---|
| Audience, consent and immutable email intent | `SyntheticAudienceEmailService`, existing `MarketingSyntheticContact`, `MarketingSyntheticConsent`, `MarketingEmailSimulation` | Pure 12-scenario ESP simulator attached to the **existing** immutable R2H email result JSON. No new sender, contact table or recipient receipt ledger |
| Human approval and campaign status | Existing `CampaignService` and `ApprovalService` | Same-brand approved campaign is still mandatory |
| Tenant isolation and operator identity | Existing OIDC User, `MANAGE_TENANT`, PostgreSQL FORCE RLS | Same admin and tenant checks, no email/PII input |
| Model request budgets | `ModelBudgetService` | Reserve/settle still wraps every request, even zero-cost simulation |
| Model execution | `GovernedModelService` → existing `BoundedModelGateway` | Server-configured `GovernedModelRouter` selects one approved provider adapter per canonical agent and purpose; no prompt-chosen route, no implicit fallback |
| Agent identity and permissions | Existing `AGENT_ROSTER` and `AgentRuntime` | Only canonical agent IDs can be routed |
| Audit/outbox | Existing AuditEvent/OutboxEvent | Existing R2H simulation events include synthetic scenario result; no second event ledger |

## R2-I synthetic ESP transport
- Deterministic 12-scenario pure contract rehearsal: accepted, bounced, complaint, rate limited, ESP 5xx, timeout after accept, duplicate callback, unsubscribe before send, delayed webhook, template rejection, token expiry and readback mismatch.
- An approved campaign and exact current synthetic consent snapshot remain required. Snapshot digest and selected scenario are bound to existing idempotency key. Reuse with different scenario, consent or creative is rejected.
- Synthetic accepted/bounce/complaint/callback counts are **virtual only**. They are not real consent events and never change authoritative consent. No actual email, recipient address, token, ESP SDK, external send or verified provider receipt exists.
- Ambiguous timeouts/readback mismatch remain `virtualOutcomeUnknown` and cannot automatically retry. SQL constrains new transport JSON to `realProviderRequests=0`, `actualMessagesSent=0`, `verifiedProviderReceipts=0`, `automaticRetryAllowed=false`, plus immutable internal SHA256 evidence. Historical R2H rows remain valid.
- PostgreSQL tests exercise OIDC/tenant, no-send spoof, scenario idempotency and immutable evidence; pure tests exercise all 12 scenarios.

## R3-C model gateway
- Server-configured `GovernedModelRouter` is a ModelAdapter under the **existing** `BoundedModelGateway`, not a second model gateway or authorization engine.
- A route is fixed to a canonical agent ID, internal purpose and configured provider. Only OPENAI, ANTHROPIC, GEMINI and LOCAL are recognized keys; unsupported or unconfigured routes fail closed.
- The optional `MARKETING_MODEL_PROVIDER=simulation` activates a deterministic offline protocol rehearsal; `MARKETING_SIMULATED_MODEL_PROVIDER` chooses provider and `MARKETING_SIMULATED_MODEL_SCENARIO` chooses one of seven outcomes. These are server environment controls, not API or prompt parameters. Defaults remain `disabled`.
- The simulator generates **no actual AI inference**, clearly labels output as synthetic, costs zero and never calls an external provider. Existing model budget reservation and settlement still run. Real Anthropic/Gemini adapters, provider API compatibility and production BYOK remain outstanding.
- No automatic fallback/retry after a failed or possibly billed model attempt. Test covers four provider protocols, unknown route, duplicate route, forged agent ID, all error scenarios, no fallback and budget settlement.

## Release acceptance and limits
These two slices are real executable software and CI-tested, but **do not complete R2 or R3**. R2 still requires editable creative, scheduling, real opt-in proof, ESP implementation and cross-channel acceptance; R3 still requires production multi-provider adapters, MCP/A2A, deep manifests, evaluated skills, deployable workflow runtime, tenant-scoped hybrid RAG and comprehensive E2E. User-approved account connection stays deferred until software is complete and staged.
