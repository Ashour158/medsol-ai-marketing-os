# Phase 5 — Controlled integration engineering (offline first)

Base: Phase 3 merged main 1b868deae9228a18b001029b7ea1a10c6b86c74a. Phase 4 PR #167 is independently validating; no claim that it has merged. Owner constraint: no real provider accounts, live keys, paid resources or external operations.

## Reuse map
- Model adapters and routing: existing BoundedModelGateway, OpenAI Responses, Anthropic Messages, Gemini generateContent, GovernedModelService and ModelBudgetService.
- MCP/A2A: existing signed GovernedToolRegistryService (metadata only) and offline protocol fixture. No remote tool execution.
- Social and creative: PlatformIntegrationHubService, existing locked dispatch gateway, canonical DAM and provider trial wire builders; no actual OAuth, provider account or capability verified.
- Email: existing synthetic consent and SendGrid trial; HTTP acceptance is not delivery.
- Trial owner: ProviderContractTrialService and canonical CommandReceipt/AuditEvent. No second integration ledger, new credential storage, network transport or dependency.

## Implemented tranche
Add authenticated read-only history, latest 100 completed trial receipts, exact tenant/ref/request-input digest binding, strict zero-effect and bounded outcome checks, redacted projection, explicit truncation. Do not return stored raw JSON, credential values, request keys or arbitrary host input. No new database tables.
Add operator-selected one-scenario matrix across the canonical provider catalog, bounded to 20, sequential requests, stop on invalid evidence or unmount, no automatic retry; success of the matrix requires matching durable receipt readback. UI shows actual observed fixture outcomes rather than claiming real connection readiness. Historical evidence remains unsigned and non-certifying.
Extend real PostgreSQL acceptance across all 14 providers x success/auth rejection/ambiguous acknowledgement (42), cross-tenant receipt exclusion, viewer and disabled actor denial, corruption denial, zero provider credentials and destinations. Extend actual signed Chromium acceptance for the 14-provider rejected-auth matrix, persisted readback after reload and viewer denial. Existing exhaustive 154 in-process provider/scenario tests remain canonical. Exact-head CI pending.

## Boundaries and remaining gates
No real provider entitlement, scopes, consent, remote receipt or model quality verified. MCP initialization and A2A message shapes do not establish actual remote invocation. Provider protocol fixture versions are repository assumptions, not current live compatibility claims. Real activation requires separately authorized credentials, eligible accounts, tenant-bound credential vault, scope and ownership attestation, budget/consent/exact approvals, default-deny egress, live sandbox and independent acceptance. WF03/WF13/WF15 and full commercial integration lifecycle remain incomplete. Phase 5 offline engineering cannot be declared validated until all four jobs pass on exact candidate with compatible main and no high/critical image vulnerabilities.
