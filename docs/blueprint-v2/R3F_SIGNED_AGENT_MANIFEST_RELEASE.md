# R3-F — Signed, Restrictive Agent Manifest Releases (Offline Governance)

**Tranche:** R3-F, 2026-11-19  
**Release status:** Implemented on a review branch; **not production certified**, not real model/tool activation.

## Mandatory Reuse Map

| Concept | Authoritative existing owner | R3-F extension |
|---|---|---|
| Agent identity and limits | `AGENT_ROSTER`, `Agent`, `AgentService` | One subordinate `AgentManifestRevision` history; `Agent.version` remains the active pointer. No additional agent identities. |
| Agent execution and decision | `AgentRuntime`, `AgentExecution` | Check signed release and restrictive capability set before executing; pin digest/version to the existing execution decision. |
| Authentication and permissions | OIDC, `User`, `BootstrapAuthGuard`, marketing permission registry | Active server-verified tenant ADMIN/SUPER_ADMIN for draft/review/activate/rollback/revoke. |
| Audit/eventing | `AuditEvent`, `OutboxEvent` | Reuse existing immutable audit and internal outbox. No new delivery queue. |
| Model/tool calls | `GovernedModelService`, `GovernedToolRegistryService`, Integration Hub | No new model or MCP/A2A executor or provider credential owner. Releases explicitly require offline-only models, empty tool grants and no persistent agent memory. |
| Learning and skills | `MarketingLearningService`, `SkillReleaseService` | Skill keys are documentary references only, not silently promoted/released skills. |

## Implemented contract

- Exactly the existing **13 canonical agents**. Unknown IDs or changes to canonical name, default risk, authority ceiling or roster capability ceiling are denied.
- Strict manifest fields: bounded mission, restrictive authorities and capabilities, descriptive knowledge and skill keys, empty tool keys, disabled external model execution and persistent memory, mandatory human review, bounded input/output sizes. Unrecognized fields and duplicates are rejected.
- Sorted canonical payload digest (SHA-256); separately trusted Ed25519 signer public key/key ID configured through `MARKETING_AGENT_RELEASE_TRUSTED_PUBLIC_KEY_PEM` and `MARKETING_AGENT_RELEASE_TRUSTED_KEY_ID`. **The server never accepts a client-supplied public key.** No trusted signer configured means all new releases fail closed.
- Tenant ADMIN proposes a signed manifest. A **different** active tenant OIDC ADMIN approves; the author cannot approve their own revision. Approved is not active until explicit CAS activation. An active revision can roll back to baseline version 1 or be permanently revoked, including atomic fallback to baseline.
- PostgreSQL `FORCE ROW LEVEL SECURITY` for revisions, trigger immutability, maker/checker constraints, and a trigger rejecting an active non-baseline Agent version without a matching APPROVED revision. No release deletion.
- Existing `AgentService.execute` no longer overwrites the installed Agent version and capability set on every run. For a released version it enforces signature validity, digest, active revision and exact capabilities. Every completed decision contains pinned version/digest and a zero-egress attestation. Baseline version 1 continues to use the static roster.
- All external effects remain off: no social publishing, ESP send, model inference via the new revision, MCP/A2A invocation, remote retriever, persistent memory writes, or production domain authority expansion.

## API (OIDC admin; exact Next BFF allowlist)

| Method | Path | Contract |
|---|---|---|
| GET | `/marketing/agents/manifests?agentId=...` | Tenant release history, 100 latest rows |
| POST | `/marketing/agents/manifests` | `{manifest,signature,signerKeyId}` -> PROPOSED |
| POST | `/marketing/agents/manifests/:id/approve` | `{expectedRevision}` -> APPROVED |
| POST | `/marketing/agents/manifests/:id/activate` | `{expectedAgentVersion}` -> updates canonical Agent |
| POST | `/marketing/agents/manifests/:id/revoke` | `{reason}` -> permanent revoke, baseline fallback if active |
| POST | `/marketing/agents/manifests/:agentId/rollback` | `{expectedAgentVersion,reason}` -> baseline version 1 |

The `signature` is Ed25519 over UTF-8 `medsol-agent-release-signature-v1\n` + `agentReleaseDigest(manifest)`; use a separately governed offline signing workflow. Never commit or transmit private keys.

## Acceptance and no-live-account proof

1. Unit: all 13 roster identities, deterministic canonical digests, trusted signing, and denial of expanded capability, tool, model, memory and resource privileges.
2. PostgreSQL: migration clean/historical, maker-checker and OIDC subject, active pointer, version CAS, runtime capability refusal, rollback, irreversible revocation, SQL tampering denial and actual unprivileged FORCE RLS cross-tenant probe.
3. Existing CI: typecheck, tests, production build and SBOM/dependency evidence; green regression tests are engineering proof **only**.

## Remaining R3 and R2 gaps

- **Not yet complete:** tenant UI for agent manifests, per-agent scoped knowledge ACL/rights, model BYOK/privacy/billing, signed *canary* releases and multi-worker kill-switch semantics, workflow Blueprint deployment/runtime execution, genuine remote MCP/A2A gateway, provider acceptance, content/creative authoring and 500-case comprehensive E2E.
- **External integrations still require actual future provider entitlements, consent, scoped credentials, third-party readback and independent security/legal acceptance; none were connected.**
- This tranche is a **bounded implementation** of the manifest-release lifecycle, not a declaration that R3 or the Marketing AI OS is complete.
