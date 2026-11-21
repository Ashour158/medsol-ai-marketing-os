# T3B — Visual authoring over the canonical offline DAG engine

**21 November 2026.** Internal offline design capability. **NOT_CERTIFIED** for production.

## Reuse Map
- The existing `MarketingWorkflowService` remains the exclusive deployment, graph execution, lease, human approval and audit owner.
- `@medsol/contracts` is the authoritative complete graph compiler; `parseOfflineDagManifest` is the only executable restricted grammar. The browser editor is a presentation and basic input-safety layer, not another validator/runner/authority.
- Canonical agent identities are fetched from authenticated `GET /marketing/agents`; no copied agent roster or independent agent table.

## Delivered
- Accessible node editor for trigger, human task/approval, bounded deterministic agent review, parallel/join and terminal nodes; explicit edge connections/removal.
- Directed SVG topology preview, guarded unique IDs, bounded node/edge counts, duplicate/cycle prevention, exact JSON roundtrip and fail-closed non-destructive behavior for unsupported drafts.
- Every visual edit synchronizes the advanced signed release JSON, clears old detached signature and resets prior run request key. The API still requires trusted Ed25519 signatures, independent OIDC admin reviewer, CAS activation and bounded internal-only runtime.
- Unit tests for topology, cycle rejection, unsupported effectful nodes, signed JSON roundtrip and immutable trigger/terminal safeguards.

## Limits
This is visual authoring for the already-implemented offline deterministic profile, not a universal executable 17-node designer, live AI connector, live social/email publisher, arbitrary agent builder or completed provider UAT. Visual validation cannot replace the canonical server simulation and deployment rejection rules. CI and independent QA are still required; release remains NOT_CERTIFIED.
