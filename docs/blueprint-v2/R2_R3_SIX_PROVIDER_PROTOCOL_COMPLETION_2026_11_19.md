# R2/R3 — Six remaining provider protocol contracts (offline only)
**Date:** 2026-11-19  
**Status:** CODED OFFLINE / NOT ACCEPTED BY PROVIDER / REAL DISPATCH DISABLED

## Reuse Map (mandatory)
| Concept | Existing authoritative owner | This tranche |
|---|---|---|
| Provider catalog and tenant connection | `PlatformIntegrationHubService`, `IntegrationConnection` | Add inactive INSTAGRAM, CANVA and ADOBE_FIREFLY provider entries; retain existing TIKTOK, YOUTUBE and X_API |
| OAuth/PKCE, credential escrow, revocation | `IntegrationOAuthLifecycleService`, `ProviderSecretEnvelope` | Extend fixed client query/scope dialects for TikTok and Instagram; test Instagram/TikTok/YouTube/X/Canva in PostgreSQL using fake broker/code/tokens only |
| Social publishing permissions and evidence | `CampaignPublicationService`, exact approval scope, `LockedOfficialProviderDispatchGateway` | No real dispatch pathway, REMOTE or PUBLISHED state, no actual external image/video upload |
| Creative designs and immutable media | `CreativeAssetService`, DAM/VerifiedMediaEvidence | Rehearse Canva autofill/design/export and Adobe Firefly async image job; never persist synthetic asset as verified creative output |
| Agent model gateway, MCP/A2A | `GovernedModelService`, `GovernedToolRegistryService` | Existing owners unchanged, no new model/tool execution authority |
| Offline contracts, chaos, audit, UI | Existing `runProviderContractTrial`, `ProviderContractTrialService`, `CommandReceipt`, `AuditEvent` and trial studio | Extend original **single** trial authority with six step-sequenced pure protocols and validated fixtures; existing OIDC/tenant/idempotency rules apply |

## Contract coverage, not credentialed integration
| Provider | Offline contract sequence | Grounding, scope and limitation |
|---|---|---|
| Instagram Professional | Media container POST → processing `status_code=FINISHED` → media_publish POST → media GET/field comparison | Instagram Login `graph.instagram.com/v27.0`, `instagram_business_basic` and `instagram_business_content_publishing`; simulated image URL ends in `.invalid` |
| TikTok | Creator-info query → direct-video init with `SELF_ONLY` privacy → single-chunk fixture PUT → `status/fetch` | `video.publish`; requires verified creator privacy choice and explicit creator consent in eventual real UI; unaudited client restrictions apply; no actual upload or public ID |
| YouTube | `videos.insert` resumable session → fixture upload PUT → processingDetails/status GET | Google OAuth `youtube.upload`; fake session URL and private metadata, no video bytes, no live quota or channel |
| X API v2 | Media initialize → append → finalize → processing status → create Post → post GET/author readback | Existing `X_API` Connection owner; mock `X` trial label only, `media.write`/`tweet.write` scopes; no real credit usage |
| Canva Connect | Autofill job → job status → export PNG job → export status/download URL contract | User OAuth; `design:content:write` and `design:content:read`; preserves editable `design_id` distinct from rendition; output is a `.invalid` fixture URL |
| Adobe Firefly | OAuth server-to-server IMS token **shape** → `generate-async` POST → Firefly status polling contract | No fake Adobe user OAuth. Server-to-server entitlement required in real world; generated raster is **not** an editable Adobe Express design and never a verified DAM asset |

### Protocol versions and audit caveats
- Graph Instagram version v27.0 is pinned as the documentation snapshot; validate supported version/permissions at later staging.
- TikTok is **Direct Post** `video.publish`, distinct from inbox `video.upload`. User consent and privacy selection are mandatory at real launch; fake privacy `SELF_ONLY` is not consent.
- X API media upload differs between documentation generations; this tranche models newer v2 initialize/append/finalize endpoints. Live protocol version must be checked against an app-scoped account before acceptance.
- Canva export job response is HTTP 200 with `job.status`; a successful job and temporary URL are not evidence that source bytes were downloaded, malware-scanned, rendition-hashed or rights cleared.
- Adobe Firefly may charge per generation; **no** generation occurs in this tranche. Generated image content is not equivalent to editable Adobe creative source.
- TikTok, YouTube and X OAuth scopes in the fixture are requested strings, **not verified granted permissions**. Instagram Login and TikTok authorization query dialects differ from standard OAuth; current broker's code exchange remains mock-only. Adobe access uses client-credentials, not user PKCE.

## Execution guarantees
- Exactly six new offline `TrialProvider` keys are appended to the existing eight; **14 total** in the original trial catalog.
- All six use ordered state-machine stage parsers, not unconditional success mocks: reference/author binding, processing status, upload chunk metadata, readback content, creative job state and approved source IDs must match before advancing.
- Six providers × 11 standard failure scenarios = **66 additional scenario cases**, alongside the previous eight × 11 = 88 baseline cases, **154 provider-scenario combinations** now covered by the test loop.
- Simulate 401/403/429/5xx, pre/post-accept timeout, malformed response, account mismatch, readback mismatch and duplicate callback. Unknown effects remain **OUTCOME_UNKNOWN**; never auto-retry.
- Trial readbacks are fixture matches only: `verifiedRemoteReceipts=0`, `actualProviderRequests=0`, `actualPostsPublished=0`, `actualEmailsSent=0`, `externalEffectsAuthorized=false`. No real provider SDK, `fetch`, HTTP, account or uploaded bytes in added protocol code.
- Tenant-scoped run and immutable idempotency evidence reuse existing OIDC, `CommandReceipt` and `AuditEvent`; exact admin-only BFF routes reused. UI now exposes each simulated protocol step and safe header **names** only.
- Clean PostgreSQL migration, historical replay, typecheck, tests, build and dependency/SBOM CI required before merge.

## Official reference documents checked 2026-11-19
- Meta Instagram account/media: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/v21.0/
- TikTok Direct Post: https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- TikTok status: https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status
- YouTube resumable: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- X official media example: https://github.com/xdevplatform/samples/blob/main/python/media/media_upload_v2.py
- Canva autofill: https://www.canva.dev/docs/apps/rest-apis/reference/autofills/create-design-autofill-job/
- Canva export: https://www.canva.dev/docs/apps/rest-apis/reference/exports/create-design-export-job/
- Adobe Firefly async: https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/using-async-apis
- Adobe credentials: https://developer.adobe.com/firefly-services/docs/firefly-api/getting-started/

## Exit criteria still unmet
**R2/R3 not certified complete** by these offline contracts. Real provider-specific OAuth exchanges, approved production/developer scopes, app review, disposable provider sandbox E2E, media binary/resumable upload, signed callbacks and independent real readback, legally authenticated senders, creative export-to-DAM byte custody and auditing, complete tenant rights, general workflow deployment and failover, knowledge/agent learning, full 500-case E2E and security/privacy sign-off remain open.

Never connect real user accounts or enable dispatch based only on green CI for this tranche.
