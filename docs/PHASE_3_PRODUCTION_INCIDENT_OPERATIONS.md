# Production operations tranche — incident response, worker liveness and signed on-call alerts

## Reuse Map / ownership
- **BrainRun / OutboxEvent:** sole authoritative sources for active incident state and recovery. This tranche never mutates those source states on acknowledgement.
- **IncidentResponse:** the *only* response metadata owner for a tenant/source occurrence (acknowledgement, last queued alert level, next escalation). It is **not** a second Brain/outbox state machine.
- **MarketingWorkerHeartbeat:** platform process liveness only; does not own or acquire work leases.
- **OutboxPublisherService:** sole delivery retry and dead-letter executor, with stable deterministic notification event IDs. No new independent delivery queue.
- **MarketingCommandCenterService:** existing read model and incident inventory, now combines acknowledgement and fleet health.
- **BrainDispatchWorker:** existing scheduler, now opt-in incident scanner, liveness heartbeat and HMAC webhook transport; it never reclaims a RUNNING Brain job.

## Controls and behavior

1. Worker liveness is persisted every **15 seconds** by an explicitly enabled Brain worker; a heartbeat more than **45 seconds** old is not healthy. A stopped worker is distinguished from an unresponsive one. Operator view reports aggregated fleet health without exposing individual process IDs or tenant details. Liveness is observational, not an uptime SLA.
2. The incident response scanner is **opt-in** and examines bounded, cursor-advanced batches of three existing source states: RUNNING Brain runs inactive for 15 minutes; NEEDS_INTERVENTION runs; and dead-lettered outbox events. Dead-lettered incident-alert delivery events are excluded from recursive alert generation.
3. New source occurrence (identified by kind/source/last source state timestamp) queues **level 0** notification. Critical incidents escalate after **15 minutes** without acknowledgement, warning incidents after **30 minutes**. At most two further escalation levels are queued, with no infinite alert loop. Repeated scans are serialized through the database and stable OutboxEvent IDs.
4. An authenticated manager may acknowledge a currently active occurrence with a **12–500 character reason**. The response and human AuditEvent are stored transactionally; repeated acknowledgement of the same occurrence returns replay without a second audit. Acknowledgement never means resolved and never replays an agent or modifies an outbox delivery.
5. Real outbound HTTPS on-call delivery is **disabled by default**, even if a scan queues internal outbox events. When enabled, the configured transport requires one fixed HTTPS domain on default port 443, a matching explicit hostname allowlist and a 32+ character HMAC secret. It rejects redirects, embeds only minimal occurrence data, and signs `timestamp + "." + UTF-8 request body` with HMAC-SHA256. Never send prompts, patient data or source-error strings.
6. Receiver requirements: validate `X-Medsol-Alert-Timestamp` within a short clock-skew window, verify `X-Medsol-Alert-Signature` in constant time, deduplicate `X-Medsol-Alert-Event-Id`, and return 2xx only after durable receipt. The outbox may redeliver the same notification after a timeout, so exactly-once network delivery is **not** claimed.

## Environment
| Variable | Meaning |
| --- | --- |
| `MARKETING_BRAIN_WORKER_ENABLED=true` | Starts the existing Brain polling worker and platform heartbeat |
| `MARKETING_INCIDENT_MONITOR_ENABLED=true` | Adds bounded 30-second incident scan and internal alert outbox queue to the worker |
| `MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED=true` | Enables actual HMAC-signed HTTPS notifications from the worker; fails startup if monitor, outbox or destination invalid |
| `MARKETING_INCIDENT_WEBHOOK_URL` | Reviewed exact HTTPS endpoint |
| `MARKETING_INCIDENT_WEBHOOK_ALLOWED_HOST` | Exact reviewed hostname, without URL scheme or path |
| `MARKETING_INCIDENT_WEBHOOK_HMAC_SECRET` | Private 32+ character secret, provision from a secret manager; rotate securely |

Do not set webhook values for the web frontend. Configure only the worker deployment. The webhook is an incident-operations destination, **never a social publishing channel**.

## API and operator procedure
- `GET /marketing/operations/workers` and `GET /marketing/command-center` require `READ_AUDIT` roles.
- `GET /marketing/command-center/incidents/:kind` includes current-episode acknowledgement and alert level.
- `POST /marketing/command-center/incidents/:kind/:id/acknowledge` requires `DECIDE_APPROVAL` manager rights and `{"reason":"..."}`. The API takes the raw source ID from the inventory, not the UI's prefixed display ID.
- Inspect the existing Brain run recovery evidence first; acknowledge only as an ownership record; then reconcile model usage, determine whether further manual quarantine is appropriate, and act through the separate, approved authority. Acknowledging cannot resolve a source incident.
- If no active worker heartbeat is recorded, the fleet health is `NO_HEALTHY_WORKERS`. Check worker configuration, process status, database access and clocks; do not infer health from empty incident lists.

## Tests / acceptance evidence
- `marketing-incident-response.integration.test.ts`: real PostgreSQL source occurrence, idempotent scan, escalation, tenant isolation, audit-once acknowledgement, non-recursive dead-letter alert, and worker heartbeat status.
- Same test file: outbound alert configuration rejects unapproved hosts/short secrets, signs outbound request, and treats non-2xx as delivery failure. Without configuration the worker does not send a webhook.
- Existing Brain crash-window, checkpoint concurrency, event inbox/outbox and human-quarantine tests remain required.
- CI migration deployment, clean-database drift check, historical upgrade rehearsal, tests, typecheck and build are required.

## Limits and remaining staging gates
A passing automated test suite does **not** validate a production pager. Before enabling live alerting, provision approved destination and authenticating receiver, run two **independent real OS worker processes** against a disposable staging database, inject SIGTERM and SIGKILL during long-running model calls and outbox publication, verify aggregate liveness and no replay, measure scan latency, alert delivery/receipt timing, false positives and RTO/RPO. Independent provider receipts and a finance exception policy are required for uncertain model costs. Verify that app administrators are authorized to share the minimal organization/source IDs with the destination. The pre-existing high-severity `picomatch` advisory and ECC Checks installation permission issue remain open. This tranche does not claim a production launch.
