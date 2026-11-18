# Microsoft Entra ID — Medsol AI Marketing OS integration

## Registration model (single tenant, delegated user authentication)
Create TWO Microsoft Entra app registrations under the SAME workforce tenant:

1. **Medsol Marketing Web**: platform **Web**, redirect URI `https://YOUR-HOST/api/auth/callback`. Register as a confidential server-side web client and configure a client secret stored ONLY on the Next.js server (or prefer certificate credentials in a later hardening pass). Never place credentials in client JavaScript. The callback requires a confidential-client secret in addition to PKCE; disable public-client flows. Rotate the secret through your secret manager and prefer certificate credentials as a later improvement.
2. **Medsol Marketing API**: expose a delegated scope `api://API-APPLICATION-ID/Marketing.Access`, add it to Web app API permissions and grant tenant admin consent. Configure API access token version 2 in the API manifest. Never request Microsoft Graph access tokens to authenticate the Medsol API.

Use tenant-specific authority `https://login.microsoftonline.com/TENANT-GUID/v2.0`. Do not use `common`, `organizations`, or multi-tenant issuer substitution. Validate `tid` and immutable `oid` from signed tokens. User.oidcSubject is `entra:tenant-guid:object-guid` (lowercase). The subject is tenant-scoped and independent of email or display name. Explicitly provision every approved user and role; no just-in-time self-provisioning.

## Required environment (staging)
Web:
- MARKETING_ENTRA_TENANT_ID=TENANT-GUID
- MARKETING_OIDC_ISSUER=https://login.microsoftonline.com/TENANT-GUID/v2.0
- MARKETING_OIDC_CLIENT_ID=WEB-APPLICATION-ID
- MARKETING_ENTRA_CLIENT_SECRET=SERVER-ONLY-WEB-APP-SECRET
- MARKETING_ENTRA_API_SCOPE=api://API-APPLICATION-ID/Marketing.Access
- MARKETING_PUBLIC_ORIGIN=https://STAGING-HOST
- MARKETING_BOOTSTRAP_ORGANIZATION_ID=MEDSOL-ORGANIZATION-ID
- MARKETING_SESSION_SECRETS=BASE64URL-32-BYTE-KEY
- MARKETING_API_INTERNAL_URL=http://private-api:3001

API:
- MARKETING_AUTH_MODE=oidc
- MARKETING_ENTRA_TENANT_ID=TENANT-GUID
- MARKETING_OIDC_ISSUER=https://login.microsoftonline.com/TENANT-GUID/v2.0
- MARKETING_OIDC_AUDIENCE=API-APPLICATION-ID (verify actual access token `aud`)
- MARKETING_OIDC_JWKS_URL=https://login.microsoftonline.com/TENANT-GUID/discovery/v2.0/keys
- MARKETING_BOOTSTRAP_ORGANIZATION_ID=MEDSOL-ORGANIZATION-ID

## Security and deployment validation
- Run Prisma migrations and provision User.oidcSubject from the Entra tenant `tid` and user `oid`; avoid email matching.
- Verify login, delegated API audience, authorization scopes, PKCE, nonce, issuer, tenant ID, signed JWT, session registration, logout and revocation.
- Verify blocked cross-tenant `tid`, mismatched `oid`, disabled users, missing delegated scope, wrong API audience, invalid callback state, CSRF and key rotation.
- Verify sign-in with Conditional Access/MFA in staging and assess enterprise access restrictions.
- Capture CI, HTTP browser E2E, identity-provider test and security review evidence before sign-off.

## Agent/OS next phase
Build an agent registry and runtime control plane with tenant-scoped capability grants, tool allowlists, model budgets, execution traces, human approval gates, replay-safe jobs, prompt-injection defenses and scientific/brand review. Integrate campaign execution only after the authentication release gates are met.

## Current limitation
Actual tenant GUID, app registrations, credentials, DNS/TLS deployment and live test accounts have not been supplied. Code-only checks cannot verify real Entra login. The confidential-client exchange requires an actual Entra app secret; certificate-based credentials, production abuse controls and provider-backed E2E validation remain outstanding. Do not claim production-ready authentication until these steps are completed.
