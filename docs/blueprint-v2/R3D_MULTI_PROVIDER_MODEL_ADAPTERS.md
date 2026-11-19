# R3-D — Anthropic and Gemini official transport adapters, unconnected

## Reuse Map
- **Model gateway authority:** existing `GovernedModelService` → `BoundedModelGateway`. Add only `AnthropicMessagesAdapter` and `GeminiGenerateContentAdapter` implementing the **existing** `ModelAdapter` interface. No second gateway or agent permission owner.
- **Budget authority:** existing `ModelBudgetService` reserves and settles estimated cost. Provider usage and reviewed price table determine estimated cost, not independently reconciled billing.
- **Agent authority:** `AGENT_ROSTER` and `AgentRuntime` remain canonical. The model never obtains publishing, tool, MCP or data access permissions.
- **Testing:** mock `fetch` with fixed official URL assertions and negative contract cases; no network, customer accounts or tokens in CI.

## Implemented
- Anthropic Messages: fixed `https://api.anthropic.com/v1/messages`, strict text-only assistant completion, `stream:false`, no tools, explicit system instruction and bounded token usage.
- Google Gemini generateContent: fixed `https://generativelanguage.googleapis.com/v1beta/models/{reviewed-model}:generateContent`, `tools:[]`, text-only one-candidate `STOP` completion, bounded token usage.
- Both reject tool/function calls, partial/unsafe finish, malformed JSON, non-JSON HTTP responses, oversized responses, invalid pricing, absent credentials and unreviewed model names. Transport exceptions remain billing-uncertain and are **never** automatically retried or routed to another provider.
- Dormant server-side composition supports `MARKETING_MODEL_PROVIDER=anthropic|gemini` **only when explicitly configured** with reviewed `MARKETING_MODEL_INPUT_RATE_MICROS_PER_MILLION`, `MARKETING_MODEL_OUTPUT_RATE_MICROS_PER_MILLION`, provider API key and model. Default remains `disabled`; user-requested no-account build continues using `simulation`.
- No actual provider call was made. Mock contract success is not a substitute for staging App/API acceptance; current provider API schema and model availability require future external validation.

## Remaining R3
Provider-specific live compatibility, enterprise BYOK vault and per-tenant routing, model capability/region/purpose policies, billing reconciliation, fallback with safe idempotency, MCP/A2A registry, deep manifests, signed skill release, hybrid RAG, deployable workflow engine, UAT and load testing. **R3 remains partial.**
