# Planned 500-scenario E2E matrix — specification, not executed test evidence

**Source:** approved v2.0 §27. The matrix below is a **future coverage allocation**. CI passing the existing test suite does not certify these scenarios.

| Suite | Area | Planned scenarios | Mandatory negative paths |
|---|---|---:|---|
| T01 | Tenant/agency isolation | 35 | IDOR, brand ACL, revocation, vector/object cross-tenant leak |
| T02 | IAM/Settings/ABAC | 30 | Privilege escalation, reauthentication, SSO and break-glass |
| T03 | Policy/approval/audit | 30 | Mutated hashes, expiry, reviewer self-approval, audit tampering |
| T04 | Workflow compiler/runtime | 35 | Cycles, idempotency, lease loss, partial join, rollback |
| T05 | Agent/model orchestration | 35 | Depth limits, model fallback policy, budget, hallucinated tools |
| T06 | MCP/A2A connectors | 30 | Tool poisoning, lost grants, SSRF, schema drift |
| T07 | Knowledge/learning | 30 | Tenant RAG leakage, rights expiry, skill regression, deletion |
| T08 | Brand/product/pricing/loyalty | 40 | Unsafe margin, claims revoked, duplicate reward, stale ERP |
| T09 | Social/community/reputation | 40 | Duplicate publishing, wrong account, privacy complaint, crisis |
| T10 | Email/consent | 45 | Suppression race, forged unsub, unsolicited import, sender DNS |
| T11 | Brief/creative | 25 | Edited rendition invalidates approval, missing rights, failed render |
| T12 | Market research/web | 25 | robots/access controls, SSRF, PII and terms violations |
| T13 | Conversion/CRM/attribution | 30 | Webhook duplicates, consent gaps, invalid causal claims |
| T14 | Billing/FinOps | 20 | Unknown provider invoice, credit caps, plan suspension |
| T15 | Reliability/DR/incidents | 30 | Two-worker crash, queue replay, restore, unacknowledged alert |
| T16 | UX/accessibility/localization | 20 | RTL, role-safe navigation, keyboard and screenreader flows |
| **Total** | | **500** | **Not authored, passed, or deployed yet** |

Every eventual case shall have: ID, release, domain owner, setup, actor roles, tenant/brand, prerequisites, exact input, expected domain state, expected denied side effects, audit/trace evidence, runner, automation status, result, failure reference and signoff. Any P0 unauthorized effect, consent breach, cross-tenant read or duplicate irreversible operation blocks production regardless of a weighted score.

**Baseline for this register:** R0-R5 progress must use GitHub test artifacts, not ECC changed-file reference scores.


## v2.1 coverage additions within the existing 500 planned scenarios

No increase to the 500-scenario target is claimed, and these are **planned future E2E cases**, not evidence of completed integration tests.

- **T07 Knowledge / memory:** tested search source permissions, snapshot freshness, AI answer vs organic ranking distinction, excluded prompts and tenant-segregated query corpora (E34).
- **T09 Social/community:** permissioned VoC import, raw PII suppression, five-record minimum *per theme*, crisis PR routing and qualified spokesperson/source approval (E35, E36).
- **T11 Creative/brief:** asset SHA-256 changes revoke approval, real editability vs flattened export, license expiry, invalid content credentials, provider capability and rights authorization.
- **T13 Conversion/CRM/attribution:** scenario microcurrency arithmetic, modelled ROI vs experimentally identified causal lift, partner-territory grant revocation, co-marketing collateral rights, source-reconciled outcomes.
- **T16 UX/accessibility/onboarding:** guided activation progress, authentic customer milestone records, agency-safe customer views, ownerless setup denial and time-to-first-approved-campaign.
- **T01/T02/T03 Security cross-cutting:** trusted tenant/brand/agency context, expired/revoked delegation, missing subscription entitlement, altered approval digest, self-approval denial, privacy/region and emergency kill switch, and unsupported provider effects.

Tests with assertions against in-memory algorithms exist in `apps/api/src/blueprint-v2-1-intelligence.test.ts` and `packages/policy/src/commercial-scope.test.ts`. Real provider/UAT tests and database RLS/identity integration remain unperformed.
