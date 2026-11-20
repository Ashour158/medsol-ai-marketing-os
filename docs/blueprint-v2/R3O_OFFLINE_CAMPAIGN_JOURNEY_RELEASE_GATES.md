# R3-O — Integrated Offline Marketing Journey & Independent Production Certification Gate

**Scope:** Implemented integration only, providerless and tenant-scoped. **PRODUCTION STILL NOT CERTIFIED.** Date: 20 November 2026.

## Reuse Map (mandatory)

| User job | Only authority permitted | Implementation |
| --- | --- | --- |
| Brief → agents → durable campaign | `MarketingWorkflowService`, `AgentService`, `BrainRunLedgerService`, `BrainRunExecutorService`, `CampaignService` | Existing workflow and brain routes drive the journey; no second agent or campaign engine |
| Creative/rendition and rights | `CreativeAssetService`, `CreativeAssetRevision` | Bounded real PNG bytes, strictly offline flattened export, separately editable copy, idempotent `CommandReceipt`, immutable metadata, human rights review |
| Byte verification | `VerifiedMediaEvidenceService` | Server-side readback of existing revision bytes; `evidenceOrigin=OFFLINE_DB_RASTER` is never scanned/real-provider eligible |
| Exact creative/campaign approval | `ApprovalService`, `Approval` | Existing independent OIDC human decision, digest and current brand policy checks |
| Social transport | `CampaignPublicationService`, `CampaignPublication`, `PublicationAttempt` | Internal sandbox simulation ONLY; remote egress remains blocked even after synthetic readback |
| Email, audience, opt-in | `SyntheticAudienceEmailService`, existing synthetic contact/consent/email tables | Synthetic recipient IDs, simulated consent and virtual ESP; zero real email, legal consent or sender tokens |
| Report and timeline | Existing `MarketingReadService`, `MarketingPerformanceService` | Tenant-only read projection of original authorities; virtual events never become impressions, verified audience delivery, customer attribution or ROI |
| Feedback/knowledge | `MarketingLearningService`, `LearningSignal` | Untrusted offline feedback enters QUARANTINED and cannot automatically change agent behavior |
| Formal release acceptance | Existing 500-slot `r3l-acceptance-case-index.mjs`; independent operator-attestation verifier | Adds one real PostgreSQL integrated assertion; detached production evidence gate requires **500 independent E2E executions** and five separate Ed25519 operator signatures; does not manufacture them |
| Tenant governance | Existing `PrismaService` transaction-local `app.marketing_tenant_id`, domain FORCE RLS and OIDC guard | All new asset and timeline accesses use existing scoped transaction and role policy; uncovered legacy tables are not claimed fixed |

**No duplicated business engine, data authority, approval table, synthetic shadow campaign store, fake external receipt or untrusted self-authorized model dispatch.**

## Executable journey

New authenticated `OfflineCampaignJourneyStudio` in the Command Center guides a tenant operator through: (0) load existing campaign from durable IDs; (1) objective/brief/brand and canonical workflow (agents + campaign with PENDING human approval); (2) offline 13-agent brain run with evidence boundary; (3) human campaign approval; (4) generated browser Canvas PNG, actual bounded bytes saved with canonical revision and editable text copy; (5) independent rights review, inert provider destination metadata, exact scope approval by another human; (6) canonical social PublicationIntent and sandbox-only simulation; (7) synthetic contact, opt-in and consent-gated email transport; (8) tenant-scoped reporting and audit inspection without fabricated engagement; (9) quarantined learning feedback. A user can paste the campaign ID to reload the durable cross-owner timeline in a new authenticated session.

**Creative capability honesty:** a flattened PNG is not layered Canva/Adobe/Figma source, media upload, malware-scanned production object or provider-ready creative. Text copy is retrievable and editable in a **new version only**; existing approved bytes never change in place. The offline raster is a 1 MB maximum disposable proof, not a customer-facing storage architecture.

**Human identity:** rights and exact creative approval cannot be automated through the creator's SSO session; separate authorized reviewers must inspect and approve. No demo mode bypasses `ApprovalService`.

**Research authenticity:** the 13-agent brain uses bounded built-in offline work packages and existing reviewed knowledge. It does not connect GPT/Claude/Gemini or fetch websites in this tranche. Draft claims remain unverified. Feedback is quarantined rather than promoted as market research.

## Tests and fail-closed controls

`postgres-r3o-full-offline-campaign-journey.integration.test.ts` runs one actual PostgreSQL lifecycle across the existing owners: independent campaign and creative approval, active Brand Master, real immutable PNG bytes, origin-checked server readback, sandbox PublicationAttempt with no REMOTE mode, synthetic opt-in and 0 actual messages, source-honest metrics and QUARANTINED learning. Negative tests cover cross-tenant draft lookup/reporting, creator self-approval, forbidden offline byte rewrite, media-origin forgery, lack of consent/campaign approval and remote egress block.

`scripts/quality/production-release-certification.mjs` is a **separate externally attested release gate**, not an automatic CI pass. It requires a 500-slot canonical case index and **500 independently executed E2E case records with immutable evidence digests**, zero uncovered tenant tables, non-BYPASSRLS production app role, independent pentest with no critical/high unresolved findings, real PITR/RTO/RPO, authorized provider staging UAT, operational/privacy/rollback checks and five distinct Ed25519 signatures (INDEPENDENT_QA, INDEPENDENT_PENTEST, PLATFORM_SECURITY, DISASTER_RECOVERY, BUSINESS_OWNER). Trusted Ed25519 public keys must come from `MARKETING_RELEASE_TRUST_KEYS_JSON` set by the external deployment authority, **not a user-submitted certificate**. The expected exact deployment SHA comes from `MARKETING_RELEASE_COMMIT_SHA`. The CLI is intentionally blocked by default. The repository runs only synthetic/negative tests of the verifier and cannot create externally approved evidence.

The authoritative 500-slot index grows from 141 to **142 mapped engineering assertions** (111 offline and 31 real PostgreSQL), **358 slots not mapped**, and **0 independent signed E2E signoffs**. Never describe it as 142 executed E2E or production certification.

## Outstanding release blockers

- **Full database tenant isolation:** the R3-N PostgreSQL census reported 46 tenant-relevant tables, only 25 FORCE RLS protected. The remaining 21 require explicit tenant/worker/app-role compatible migrations, low-privilege regression probes, not blind policies that break current service access.
- **Independent 500-case acceptance:** no external QA operators have signed or executed the complete 500-case program in a staging environment. Cryptographic verifier code cannot substitute for human/operator participation.
- **Independent pentest, production SSO, secrets/key rotation, actual production PITR/RTO/RPO/on-call test:** none can be certified from disposable GitHub CI alone. They require provisioned environments, reviewed runbooks and authorized external specialists.
- **Real eligible-provider staging UAT:** intentionally **not performed**. User instruction prohibits real provider accounts/publishing until software is engineering-complete.
- **UI acceptance:** the full offline workspace is wired, but a human operator must exercise browser accessibility, platform-specific appearance, and distinct user sessions. CI integration tests are not independent browser/user E2E certification.

The next tranche must close RLS/worker gaps and complete more independent browser/role acceptance, rather than claiming an offline simulation proves commercial readiness.
