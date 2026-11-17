# Audit Model

Every material command, decision, approval and state transition emits an audit record containing actor type/id, organizationId, action, object type/id, before/after snapshots where appropriate, correlationId, causationId and timestamp.

Audit is append-only. Business tables are not treated as audit history.