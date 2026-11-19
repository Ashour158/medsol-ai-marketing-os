# R2/R3 — official-provider-shaped offline connection trials

## Purpose and non-negotiable safety boundary
Build and exercise **real provider API protocol shapes** without any real provider account, app registration, customer destination, OAuth callback, ESP sender, API key, network request or external side effect. The local fixture is not a provider sandbox, production integration, app review, verified post, email receipt, real AI inference, or MCP/A2A invocation.

**This tranche does not turn on external dispatch.** The existing `LockedOfficialProviderDispatchGateway`, no-REMOTE/no-PUBLISHED SQL publication state machine, email no-send contract, signed MCP/A2A metadata-only registry, and model cost authority remain intact.

## Mandatory Reuse Map
| Business concept | Authoritative owner | This tranche |
|---|---|---|
| Provider catalog and social connection | `PlatformIntegrationHubService`, `IntegrationConnection` | Meta/LinkedIn **fixed wire contracts**; no duplicate customer connection |
| OAuth/PKCE, fake encrypted tokens and revocation | `IntegrationOAuthLifecycleService`, `ProviderSecretEnvelope`, `ProviderCredential` | Actual Meta/LinkedIn authorization endpoint URL shapes exercised in PostgreSQL with **in-process fake broker** and one-use code |
| Social publication intent and delivery | `CampaignPublicationService`, `PublicationAttempt`, `LockedOfficialProviderDispatchGateway` | No canonical publication transition, no real HTTP; simulate official create and independent GET response formats |
| Email audience/consent/journey | `SyntheticAudienceEmailService`, `MarketingEmailSimulation` | SendGrid Mail Send v3 request/202 response **fixture**; no email or legal opt-in |
| AI model router and budgets | `GovernedModelService`, `BoundedModelGateway`, existing OpenAI/Anthropic/Gemini adapters | Exercise the **actual existing adapter implementations** against injected in-process `fetch` replacements, not a second model gateway |
| MCP/A2A tool/peer trust | `GovernedToolRegistryService` | JSON-RPC initialize/message envelope fixtures; no `tools/call`, remote peer or credential |
| Tenant identity, idempotency, audit | Existing OIDC `User`, `CommandReceipt`, `AuditEvent` | Reuse exact active subject/role, tenant-scoped serializable transactions, advisory lock, same-key replay, changed-key conflict, audit |
| Admin UI | Existing Next.js session BFF and Marketing dashboard | One provider contract trial studio, exact allowlisted catalog/run endpoints |

## Provider protocol trial matrix
| Provider | Rehearsed actual API shape | Local test result | What it **does not** prove |
|---|---|---|---|
| Meta Facebook Page | Graph `POST /{page-id}/feed`, `GET /{post-id}?fields=id,from,message`, `X-Hub` webhook security already in R2E | Fake Page and post IDs, text/account readback comparison | Real Meta app review, Page ownership, Facebook/Instagram media upload, live post |
| LinkedIn organization | `POST /rest/posts`, `Linkedin-Version`, `X-Restli-Protocol-Version`, `x-restli-id`, GET readback | Organization author/URN and text fixture validated | Restricted organization scopes, real page role, media asset upload, actual post |
| SendGrid | `POST /v3/mail/send`, RFC-shaped `example.invalid` sender/recipient, HTTP 202 + message ID | Accepted-unverified only; no delivery claim | Verified domain, SPF/DKIM/DMARC, opt-in, unsubscribe, deliverability, signed feedback |
| OpenAI | Existing Responses API adapter, `store:false`, `background:false`, `tools:[]` | Actual adapter request/response parser with fake fetch and fake key | Provider response acceptance, cost/billing, real inference |
| Anthropic | Existing Messages API adapter, no tools | Actual adapter and bounded parser with fake fetch | Account entitlement, real inference or billing |
| Gemini | Existing generateContent adapter, `tools:[]` | Actual adapter and bounded parser with fake fetch | Real model access, invoice reconciliation |
| MCP | JSON-RPC `initialize` and versioned capabilities | In-process server envelope, no tool call | MCP remote gateway, tool permission, DNS safety, output quarantine |
| A2A | JSON-RPC `message/send` envelope | In-process fake peer task | Real A2A peer identity, signed task, durable orchestration, remote message |

### OAuth handshake rehearsal
The actual canonical PKCE service builds Meta and LinkedIn official authorization URLs with S256 code challenge and state. PostgreSQL tests verify one-use state, exact code verifier, mock broker-only code exchange, fake encrypted token storage, `PENDING_ATTESTATION` and `PENDING_VERIFICATION` (never VERIFIED), duplicate exchange denial, and permanent connection/credential revocation. No URL is opened and no real provider is contacted. Meta and LinkedIn scopes in the fixtures are **requests only**, not granted entitlements. Provider-specific OAuth/PKCE acceptance and app review remain future external tests.

### Chaos, replay and security
- Eleven scenarios per provider: success, unauthorized, insufficient scope, rate limiting, server error, timeout before acknowledgment, timeout after accept, malformed response, account mismatch, readback mismatch, duplicate callback. Unsupported protocol/scenario combinations fail closed.
- HTTP success, webhook and fixture readback never count as verified real delivery. Ambiguous outcomes never auto-retry.
- Trial results explicitly fix all real request, post, email, model, MCP, A2A and verified receipt counters to zero; `externalEffectsAuthorized:false`.
- Fixed endpoints, no caller-supplied URL/token/secret/account/text. The UI and audit show only host, path, header **names**, body field names and SHA256 wire fingerprint; no credential values.
- Admin-only OIDC routes `GET /marketing/integrations/trials/catalog` and `POST /marketing/integrations/trials/run`. The latter reuses `CommandReceipt` for unique tenant-scoped idempotency and `AuditEvent` for a safe trace. No new provider database tables.
- Test matrix exercises all eight providers and eleven scenarios; PostgreSQL tests cover independent tenant isolation, disabled/forged users, same-key replay and concurrent calls, altered-scope rejection and no changes to publication/email/credential authorities.

## Protocol references (review pinned versions before future staging)
- LinkedIn Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- Meta Pages API: https://developers.facebook.com/docs/pages-api/posts/
- SendGrid Mail Send v3: https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send
- OpenAI Responses: https://platform.openai.com/docs/api-reference/responses/create
- Anthropic Messages: https://docs.anthropic.com/en/api/messages
- Gemini generateContent: https://ai.google.dev/api/generate-content
- MCP specification: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- A2A specification: https://a2a-protocol.org/latest/specification/

## Acceptance verdict and remaining external gates
**Official-shaped wire contracts = tested offline, subject to CI. Real provider connection = not accepted.** Required before any real dispatch: (1) registered/reviewed apps and scopes, (2) provider-approved sandbox or disposable test accounts, (3) audited per-provider credential and OAuth broker, (4) immutable approved text/media byte binding and upload protocols, (5) canonical one-use remote dispatch claim and crash/unknown-outcome recovery, (6) signed webhook plus independently authenticated GET readback, (7) sender/domain/consent/suppression compliance, (8) DNS-safe MCP/A2A execution gateway and output quarantine, (9) security/DR/customer UAT. TikTok, YouTube, X, Instagram, Canva and Adobe are **not** implemented by these wire trials. They remain separate provider-specific adapters and acceptance work, not implied support.

**Do not mark R2 or R3 complete based on local fixtures.**
