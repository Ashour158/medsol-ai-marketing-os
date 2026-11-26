# T1 community advisory queue (E18/E19/WF09/WF10)
Reuse SocialCommunityCaseService, immutable case creation, exact-round ApprovalService, signed actor checks, tenant RLS and existing operator queue. No additional case authority, network transport or route.

- Risk-first open/pending queue (URGENT, HIGH, NORMAL, LOW), oldest original creation first within each priority; resolved cases use remaining slots. Cap visible rows at 100, exact per-priority active/overdue counts in one repeatable-read tenant snapshot.
- Internal advisory v1 targets: urgent 60 minutes, high 240, normal 1440, low 4320. At the due instant the case is overdue; closure freezes elapsed time and reopening restores the original clock. These are engineering defaults, not contractual or medical obligations.
- Visible snapshot timestamps and due status, no automated email, crisis notification, reply, posting, external resolution or credential verification.
- Tests: deterministic boundaries and inconsistent closure, actual PostgreSQL scope, closed and reopened case timing, original existing approval and RLS regressions.

CI must pass before merge. Remaining: configurable SLA policy, durable alert delivery, authorized inbox/response provider, independent professional review, customer acceptance. NOT_CERTIFIED.
