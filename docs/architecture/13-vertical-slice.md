# Vertical Slice Implementation Contract

1. Receive a tenant-scoped marketing request.
2. Validate the command envelope and request payload.
3. Create an agent execution record.
4. Run CMO assessment.
5. Run Strategy assessment.
6. Evaluate capability/risk policy.
7. Create an approval request when policy requires it.
8. Only the Campaign domain service may create/change Campaign state.
9. Persist audit records for decisions and state changes.
10. Emit domain events after successful persistence.
11. Return correlation/causation identifiers to the caller.

No model output directly mutates campaign state.