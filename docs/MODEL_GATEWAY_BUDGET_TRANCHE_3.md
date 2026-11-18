# Model Gateway & Budget Ledger — Tranche 3

## Implemented
- Provider-independent `ModelAdapter` contract and bounded `BoundedModelGateway` with strict Zod request/result schemas, maximum output tokens, cost ceiling, abort signal and timeout.
- `DisabledModelAdapter` is the only wired adapter. **No external model calls are enabled** until provider-specific credentials, rate limits, output validation and billing reconciliation are configured.
- Authoritative PostgreSQL `ModelBudget` (per-tenant spending limit, reserved and spent) and `ModelUsage` (idempotent request, agent, reservation, actual cost, token counts and state).
- Serializable transactional reservation and settlement; database CHECK constraints enforce nonnegative balances and reserved+spent <= limit.
- Tenant-scoped, READ_AUDIT-protected budget telemetry endpoint and dashboard display.
- Automated tests for no-provider fail-closed behavior, token/cost limits, timeout cancellation, budget exhaustion, idempotent reservation and one-time settlement.
- No auth bypass. Microsoft Entra configuration remains deferred for internal development only.

## Important release limitations
- Currency units are **micro-units of a configured provider billing currency**; do not combine different currencies or provider price books in one tenant budget. A provider-specific billing configuration and exchange-rate policy must be added before activating spending.
- Provider timeouts can be ambiguous: a remote provider may bill after cancellation. **Reservations are deliberately retained** on errors until an authoritative reconciliation worker confirms cost or releases them. Reconciliation and lease-based stale reservation recovery are not yet implemented.
- This tranche adds the bounded gateway and budget infrastructure, **not a live provider integration**, production-ready model orchestration, or fully durable execution leases.
- Per-tenant budget rows must be provisioned explicitly; missing rows disable spending. Deploy the migration `20261118040000_model_budget_ledger` before enabling the service.
- No automated publishing, scientific claim approval or unrestricted tool invocation.

## Next
1. Provider-specific model adapters with structured response validation and immutable price-book version.
2. Durable execution leases, outbox-driven dispatch, retry/reconciliation and dead-letter handling.
3. Security telemetry, tool sandbox, prompt-injection defenses and tenant budgets by currency/provider.
4. Entra staging integration and browser E2E before production deployment.
