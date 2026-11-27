# Phase 4 — Alpha product experience

Baseline main 1b868deae9228a18b001029b7ea1a10c6b86c74a (PR #166), exact validated candidate f646815a65e2461977d67ae03ed1db6e7467ae34, CI 45931220737: four successful jobs, signed 13-agent packaged and browser runs, zero high/critical image findings. Persistent staging and independent human acceptance remain open.

## Scoped UX refinement
- Executive overview: search/filter the existing loaded campaign portfolio, six matching launch actions, honest bounded counts and empty states. No new campaign authority.
- Campaign portfolio and readiness: direct resume buttons; readiness blocker links use the actual focus navigation. Handoff scoped to signed tenant and actor, resets prior campaign/creative state by remount, preselects only; explicit existing API readback is required. No writes on selection. A prior explicitly started operation may still finish on the server.
- Integrated journey: canonical ten-stage offline milestone labels, evidence-only progress, no inference of certification or external delivery. Existing creative editing, revision and rights-review controls retained; no new creative renderer.
- Blueprint Studio: add bounded visual authoring using the existing graph editor, no duplicate graph engine or signing authority. Advanced virtual-only JSON is preserved unless operator explicitly selects starter; edits invalidate the preview and request key. Unsigned handoff to existing Workflow Studio is actor/tenant bound; human signature, independent approval and activation still required.
- Agent Studio: retain existing 13-agent visual map and signed configuration owner; improve keyboard focus on workspace navigation and account access. No arbitrary agent creation.
- Responsive UI: tighter mobile fields, touch targets, bounded images, visible focus, unique SVG markers and horizontal graph scrolling. Existing API role checks remain authoritative.

## Exit evidence
Expand existing T1E-001 signed Chromium case for mobile visual edit, valid canonical simulation and unsigned handoff/focus. Extend T17-001 integrated journey for executive campaign search, status filtering, explicit scoped selection and readiness resume, canonical milestone progress. Existing creative T4A and Phase 3 signed tests remain unchanged except T17-001 additions. Require full exact-head CI, same-run artifacts, zero high/critical findings and compatible main before merge. Do not mark UI observations or independent product acceptance passed until actually run. Scope is existing internal Alpha, not full commercial UX or arbitrary dynamic agent factory. Independent human usability review and persistent hosted acceptance remain outstanding.
