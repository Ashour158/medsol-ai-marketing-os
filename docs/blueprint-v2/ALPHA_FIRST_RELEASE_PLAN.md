# Medsol AI Marketing OS — Alpha-first release control
**Decision:** 26 November 2026, product owner approved internal working Alpha before additional features. This document governs delivery priority and Alpha acceptance, not the ultimate product scope. Master Blueprint v2.1 and proposed creative extensions remain target backlog; no capability is certified or waived by this plan. The 36 engines, 41 workflows, 13 agents and single-owner boundaries remain unchanged.

## Alpha product definition
A persistent, usable internal application operated by authorized Medsol test users, using synthetic or explicitly approved non-sensitive fixture data, real UI/API/database and deterministic simulated providers. A user can complete a campaign from business profile/brand and brief to research evidence, strategy, editable creative, independent approval, simulated social/email, reporting and controlled learning. All actions are traceable, repeatable, and fail closed. AI output from mocks is visibly labeled; Alpha is not real model intelligence, live posting, email delivery, real customer CRM processing, or commercial SaaS. No paid infrastructure or live keys authorized by this decision.

## Scope freeze and sequence
No new feature exploration, new runtime dependency or broad upstream import on Alpha critical path. Fix existing paths first. Adopt permissively licensed code only when needed to close an Alpha gate with pinned source, licenses/notices, tests and security review; restricted code is feature inspiration only. Preserve all current security boundaries; never relax an approval or tenant gate for convenience. One business concept, one owner.

| Package | Deliverable / required exit evidence |
|---|---|
| A0 — Stabilize baseline | Inspect final-head CI and changed files of open PRs #154, #155, #156 and current main. #154 only if bounded silent-video persistence is safe and useful; it is not an Alpha prerequisite unless a documented baseline regression depends on it. #155/#156 advanced creative work is parked for post-Alpha except independently required fixes; preserve branches and provenance. Reconcile conflicts, do not merge unvalidated feature scope. Run consolidated build, typecheck, migration, tests and browser regression on exact candidate. |
| A1 — Functional internal workspace | Real test OIDC sign-in/out, tenant/brand switch only where authorized, role-based access and operator navigation. Create business profile, brand, approved source/product fixture and campaign. Editable inputs, validation, error states, exports and durable data after refresh/restart. Existing canonical agents, brain run, status/trace, bounded retries, stop, and operator review. No dynamic arbitrary agent registration required. |
| A2 — Complete core campaign | User brief → reviewed source evidence → strategy → editable copy, static creative and existing bounded storyboard where available → exact-version independent approval → calendar → simulated social/email (synthetic consent, suppression and outcomes) → source-labeled analytics and reviewed learning. Existing model gateway and integration hub mocked, no external egress. Conversion and commercial evidence exercised with synthetic form/lead and currency-separated metrics; unsupported claims/controls labeled or hidden, not faked. |
| A3 — Controlled agent and workflow operation | Fixed 13 canonical agents, existing signed manifest and bounded workflow/blueprint simulation or executable offline subset only; demonstrate draft, validation, approval, execution/trace and failure handling where supported. Explicitly label virtual-only graphs and mock model output. No arbitrary factory or dynamic team requirement for Alpha. Verify source/brand/tenant ACL, exact revision and no model/tool bypass. |
| A4 — Real environment, reliability and acceptance | Persistent test-only deployment (local dedicated machine/container or approved free environment if feasible), real PostgreSQL restricted role, migration from existing snapshot, backup/restore rehearsal, restart and recovery, secret hygiene, tenant separation and revoked-access tests. Execute named Alpha journeys against exact deployed candidate, record results with commit/build/environment and operator signoff. No critical/high unresolved risk in Alpha scope; review dependency findings. |
| A5 — Launch decision | Produce signed internal Alpha acceptance checklist, operator runbook, known-limitations register, rollback/restore instructions and release tag only after gates pass. Explicit NO-GO if any required gate fails or evidence is missing. Launch decision by product owner and independent reviewer; no self-certification by agents or CI. |

## Minimum Alpha acceptance checklist
All of the following require observable evidence, not a screenshot or checklist alone:
- AL01 authorized sign-in, unauthorized and revoked access rejected; two fixture tenants cannot read or mutate each other's records, including exports and worker operations.
- AL02 business/brand/brief/campaign data created, reloaded and persisted; audit and role checks.
- AL03 canonical agent/brain orchestration with visible trace, mock provenance, bounded recovery and stop; no real model calls.
- AL04 editable creative/source revision and preview/export with exact lineage; changed source invalidates prior approval.
- AL05 distinct maker/checker approves correct campaign/asset revision; wrong actor, scope, stale approval rejected.
- AL06 social simulation success, rejection, ambiguous and duplicate cases; no actual post, no blind retry.
- AL07 email simulation with synthetic consent, withdrawal, suppression and mock delivery; no SMTP/network.
- AL08 reviewed evidence, synthetic conversion/CRM rehearsal, currency-separated analytics and explicit non-causal labels.
- AL09 controlled learning review and workflow/blueprint draft/trace with unsupported operations clearly disabled.
- AL10 clean build and migration, existing-data migration, persistent deployment, restart/restore; error handling and audit; egress default deny and no real credentials.
- AL11 integrated browser journey by an operator independent of implementer, with test results, known limitations and rollback rehearsal.
- AL12 product owner go/no-go recorded; release not called production-certified.

Use existing 500-case acceptance index, CI evidence and production certification owners; Alpha checklist is a release-scope projection, not a duplicate test registry. Link applicable existing case IDs and actual executed results. Do not mark unexecuted cases passed. Independent full 500-case program, production security/pentest, live provider entitlement and commercial UAT remain mandatory before V1.0, not waived by Alpha approval.

## Post-Alpha backlog (preserved, not deleted)
- Beta: controlled real model/provider connections only with separate user authorization; eligible OAuth/entitlement/credential lifecycle (WF03/WF13/WF15), real consent and reconciliation; expand monitored workflows.
- Beta/V1: dynamic agent factory WF27 and team assembly WF28, deeper reasoning and learning, subscription/offboarding WF12, commercial tenant/agency controls, operational SRE and independent 500-case security/QA acceptance.
- Advanced creative: PRs #155/#156, full timeline/multitrack, verified encoding/audio, reference analysis, graphics canvas, OpenMotion selective adoption, data-to-video, batch/localization and advanced effects. Schedule after Alpha; do not delay the core launch. Restricted Remotion code not copied.
- Remaining R0–R5 target scope, commercial integrations, paid media, pricing/loyalty and broader customer features remain on the canonical blueprint; reprioritize after actual Alpha feedback.

## Status at plan approval
Planning decision only. No release gates passed by this document, no branch merged, no deployment or provider activation. Tranche 1's earlier full-scope acceptance remains open, separate from Alpha scoped acceptance. Registry classifications remain unchanged until implementation evidence warrants change. First engineering action: A0 combined baseline review and regression, then A1–A5 in sequence. Track evidence on the existing repo/PRs and release checklist; avoid adding speculative features.
