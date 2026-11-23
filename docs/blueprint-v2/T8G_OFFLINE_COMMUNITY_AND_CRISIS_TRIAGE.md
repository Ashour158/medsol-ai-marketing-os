# T8G — Existing social agent: human-only discussion triage preview

## Reuse Map
- **Canonical social agent**: `MKT-SOC-001` and `packages/agent-runtime/src/social-discussion.ts::triageSocialDiscussion`. No second classification model, community-case aggregate, comments inbox or reply executor.
- **Identity/authorization**: The same signed OIDC guard, `marketing-permissions` with `ASSESS` scope and the existing Next.js same-origin authenticated BFF. Strictly an added `POST /marketing/social/discussions/triage-preview` route; POST reply/publish routes remain unavailable.
- **Existing Social Studio**: mounts a mock-data-only triage editor, invokes the original agent engine, displays the human-required disposition/escalations and can export anonymous metadata using the existing shared CSV helper. No text/body/contact ID in export, and no actual social account.
- **Existing T6B release checker and 500-case QA** remain untouched.

## Delivered offline social/community/error handling
1. **Classification**: manually supplied synthetic discussion with a bounded identifier, mock status and moderation. No real social listening, comments scraping, inbound webhook, external fetch or public response.
2. **Risk flags**: clinical/scientific -> SCIENTIFIC_REVIEW; unverified marketing/regulatory claim -> BRAND_REVIEW; suspected personal information -> PRIVACY_REVIEW. All are suggestions, never automated escalations or clinical/legal conclusions.
3. **Human review always required**. Cross-tenant spoofed input fails closed. Exports only the bounded original-agent disposition/reason/escalation metadata; no message text or account identifiers.
4. **No automatic reply**: the Next BFF and server route permissions reject reply / publish paths.
5. **Regression evidence**: Node/Vitest checks on permission and sensitive CSV fields, existing full BFF inventory test increases its canonical route count by one; existing R3Y 19-case signed-OIDC browser test includes real API triage, cross-tenant denial and forbidden reply route (without inflating case count).

## Not claimed
No live social listening, follower sentiment or crisis alert automation, persisted case lifecycle, real platform account, human sign-off on a real comment, scientific claim verification or production acceptance. Cannot mark E17, E18, E19 or WF09/WF10 fully implemented. **NOT_CERTIFIED.**
