# Blueprint v2.0 — Brain and Agent depth contract

This is an implementation charter. It creates **zero** additional running agents. The existing canonical roster is the identity and audit authority. Product-facing personas can show capabilities from one or several canonical roles, but the delegated task's `canonicalAgentId` is immutable.

## Shared deep manifest v2 (required for all 13 existing agents)
Each versioned agent definition shall include: canonical ID; persona alias; owner domain and business fact authority; mission; non-goals; permitted task taxonomy; expert knowledge/sector/language; data sensitivity; memory scope (public platform, tenant, brand, campaign/journey, task); evidence retrieval allowlist and freshness; tools and MCP trust tier; provider capability and privacy policy; structured input/output schema; autonomous risk ceiling A0–A4; role/scope grants; deadline/depth/delegation/cost/tokens; collaboration (direct, DAG, fan-out, event, shared artifact, peer critique, A2A, MCP, human task); stop and fallback; evaluation/golden/red-team corpus; result quality KPIs; telemetry and incident playbooks; signed version, release, canary, rollback and retirement.

### Cognitive responsibilities (B01–B10)
| Brain | Effective canonical identity | Reasoning contract and limitation |
|---|---|---|
| B01 Executive Director | MKT-CMO-001 | Assess goals, decompose objective, propose bounded multi-agent team and decision packet; cannot authorize itself |
| B02 Business/Brand | MKT-BRAND-001 | Explain approved business profile, brand kits, claims and regional restrictions; only human-reviewed master is authoritative |
| B03 Market/Audience | MKT-STR-001 | Ground segment and competitor hypotheses in licensed sources, use consent only from audience owner |
| B04 Strategy | MKT-CMO-001 / MKT-OPS-001 collaboration | Plan channel/campaign alternatives and dependencies with uncertainty and delegated budget |
| B05 Creative | MKT-CREATIVE-001 | Interpret briefs, storyboard and select design adapters without falsely claiming editability |
| B06 Community | MKT-SOC-001 | Classify interactions, consider privacy, crisis and support routing; public response human-controlled |
| B07 Performance | MKT-ANA-001 | Compare genuine source observations and hypotheses; no fabricated attribution |
| B08 Risk | MKT-SCI-001 + MKT-BRAND-001 review | Flag scientific, financial, compliance, safety, rights and privacy issues; advisory, not final policy owner |
| B09 Learning | MKT-ANA-001 + existing SkillReleaseService | Observe feedback, propose evaluated knowledge/skill changes; no runtime self-modification |
| B10 Commercial | MKT-GROWTH-001 + MKT-PM-001 | Margin and pricing proposals tied to ERP/PIM authority and finance approval; no points or price write |

### Twelve target UX personas, no shadow role
| Persona | Canonical runtime owner | Target-depth outputs, not claims of current execution |
|---|---|---|
| AG-DIRECTOR | MKT-CMO-001 | Objective decomposition, evidence pack, approvals, team assembly and escalation |
| AG-BRAND | MKT-BRAND-001 | Brand audit, claims review, visual kit, multilingual brand health |
| AG-PRICE | MKT-PM-001 adviser | Proposed regional price book, margin/tax/currency simulation and finance review; no ERP writes |
| AG-PRODUCT | MKT-PM-001 | Product projection, verified use cases, competitor comparisons, launch kit and stale-claim invalidation |
| AG-LOYAL | MKT-CRM-001 adviser | Retention journeys, consent-scoped loyalty plans, reward liability and fraud checks; no native points ledger unless enabled |
| AG-MARKET | MKT-STR-001 | Research plans, sourced TAM/SAM/SOM, market maps, watchlists, opportunity hypotheses |
| AG-CREATIVE | MKT-CREATIVE-001 | Structured brief, editable design source, storyboard, renditions and asset lineage |
| AG-SOCIAL | MKT-SOC-001 | Capability-aware approved posts, schedule plans, receipts and channel metrics |
| AG-EMAIL | MKT-CRM-001 adviser | Consented email journeys, audience snapshots, deliverability review and send plans |
| AG-COMMUNITY | MKT-SOC-001 | Inbox triage, complaint/crisis escalations, approved reply packages |
| AG-ANALYTICS | MKT-ANA-001 | KPI trees, source-reconciled measurements, experiment and attribution caveats |
| AG-GOVERNANCE | MKT-SCI-001 adviser | Risk assessments, evidence/rights/regulatory packs; no self-issued approval |

## Collaboration rules
- Direct task delegation is tenant/brand/actor-scoped with immutable origin and max depth.
- Dynamic teams never gain privileges beyond initiator's intersection with tenant ceiling and tool grants.
- Parallel agents may disagree; canonical decision policy and human escalation resolve disputes, not votes.
- Evidence and shared artifacts are immutable ID/version references with rights and ACLs, not copy-pasted unverified truth.
- MCP and A2A are **external trust boundaries**, always capability and egress-gated.
- Effects are `APPROVED_EXACT_SCOPE` or blocked, with `OUTCOME_UNKNOWN` reconciliation rather than blind retry.
- Learning is a proposal→offline eval→red-team→independent approval→staging canary→monitor→rollback cycle, not unsupervised prompt editing.

## Non-completion notice
No true Agent Studio factory, signed runtime manifest migration, multi-provider router, MCP/A2A tool execution, long-term tenant memory, dynamic teams, design application connectors, social posting or email sender has been implemented merely by this charter.


## v2.1 advanced specialist capability attachments (same canonical 13-agent roster)

All additions **extend** existing agent contracts; the brain numbers, runtime identities, authority and approval constraints do not change.

| Capability | Existing agent / brain | New specialist knowledge and reasoning skills | Required evidence and evaluation |
| --- | --- | --- | --- |
| E34 Search & AI Discovery | MKT-STR-001 B03, MKT-ANA-001 B07 | Query-intent portfolio, website/search visibility hypotheses, sampled AI-answer citation auditing, multilingual query equivalence, controlled optimization experiments | Query frame, authorized source, timestamps, coverage and repeatability; never invent ranking |
| E35 Voice of Customer | MKT-SOC-001 B06, MKT-STR-001 B03 | Permitted feedback theme coding, buying objection/JTBD, journey friction, complaint risk, sampling bias, cohort privacy | Purpose and data-rights owner, reviewer, minimum-cohort suppression and independent multilingual labels |
| E36 PR & Earned Media | MKT-CONT-001, MKT-BRAND-001 B02, MKT-SCI-001 B08 | Corporate messaging, speeches, media evidence, spokesperson identity, coverage analysis, crisis escalation and corrections | Verified quotes, rights, brand and qualified legal/scientific review, exact approval |
| E20/E21 Revenue Decisions | MKT-ANA-001 B07, MKT-GROWTH-001 B10 | Marketing mix scenarios, cost and unit margin sensitivity, true experimental incrementality vs attributed performance | Reconciled source metrics, documented assumptions, finance owner and explicit causality label |
| E14 Content Authenticity | MKT-CREATIVE-001 B05, MKT-BRAND-001 B02 | Design source vs export, asset digest, usage rights, license expiry, source and C2PA evidence when actually verified | Immutable hashes, license, capability-specific editability and human rights review |
| WF40 Sales/Partner Enablement | MKT-PM-001 B10, MKT-CONT-001 B04 | Territory/channel kits, objections, partner product claims, compliant collateral and co-marketing | Authorized partner grant, ERP/PIM product revision, territorial rights and approved claims |
| WF41 Customer Activation | MKT-OPS-001 B01, tenant operator | Guided first campaign, value milestones, customer training and service-health adoption | Verified tenant/agency/brand/IAM/entitlements/approval data; independent UAT |

### Learning depth and governance for all added specialist skills
Skills are hypotheses until evaluated. For each agent add curated and tenant-scoped knowledge corpus, source rights and expiry, task-specific evaluation fixtures, red-team negatives, expected structured output and cost budget, review owner, canary/promotion/rollback criterion and incident runbook. Feedback may propose improvements, but never change its own prompts, tools, policies or privilege ceilings without independent release approval. Marketing performance is judged on evidence and meaningful customer outcomes, not model verbosity.
