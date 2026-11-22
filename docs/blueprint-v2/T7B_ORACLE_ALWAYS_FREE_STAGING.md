# T7B — Oracle Cloud Always Free staging target (NOT DEPLOYED)

## Reuse Map
- Reuse **T1E** staging OIDC, PKCE, Next/Nest auth, existing `infra/staging/compose.yml`, `t1e-staging-preflight.mjs`, `t1g-staging-db-policy.mjs` and signed tenant-claim policy. Do not build a second authentication service.
- Reuse existing **T6B** production release checker, existing **R3Y** independent 500-case acceptance index and T7A unsigned operator packets. OCI profile validation cannot certify staging.
- Existing PostgreSQL FORCE RLS / tenant ownership remains canonical; Redis, database and services are not newly duplicated.

## Confirmed Oracle free budget (November 2026)
Oracle's current official Always Free documentation describes **2 Ampere A1 OCPUs / 12 GB RAM** (1,500 OCPU-hours and 9,000 GB-hours/month) and **200 GB total boot+block volumes** in the **tenancy home region**. The older 4 OCPU / 24 GB allowance is not a safe assumption. Use `VM.Standard.A1.Flex`, Ubuntu arm64, 2 OCPU, 12 GB RAM, 50 GB boot volume initially. Do not choose paid shapes, out-of-region resources, paid public networking, extra volumes or paid backup services without explicit approval. Free A1 capacity can be unavailable; Oracle may reclaim idle Always Free instances.

Official sources:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/

## OCI operator steps (manual, after account access is granted)
1. Sign in to https://cloud.oracle.com/ with the account owner; set MFA. Choose the home region carefully. Do not share login credentials, API private keys or credit card data in GitHub or chat.
2. Create a staging compartment, set strict OCI compartment quotas and a zero-spend monitoring/alert policy. A $0 budget alert is not a guaranteed hard spending cap; confirm all resources show **Always Free eligible** in the console before provisioning.
3. Provision **one** A1 Flex Ubuntu arm64 VM (2 OCPUs / 12 GB), a 50 GB boot volume, in the home region. Capacity may require retrying another availability domain or waiting; do not silently switch to a paid shape.
4. Allow only 443 inbound to the public reverse proxy and narrowly scoped SSH from operator-approved source IPs; do not expose API 3001, PostgreSQL 5432, Redis 6379 or the internal OIDC management UI publicly. Configure host firewall, patching, disk encryption, log rotation and resource ceilings.
5. Configure separate operator-owned DNS HTTPS origins for the frontend and the isolated MFA OIDC identity service. A self-hosted Keycloak can be used only after ARM64 compatibility and realistic 12 GB capacity are verified. The original T1E preflight requires a **non-loopback, verify-full TLS PostgreSQL endpoint**; do not bypass that rule for convenience.
6. Build, security-scan and verify **linux/arm64** production Next.js and NestJS images (including Prisma engine and native dependencies), pin registry `@sha256` digests and ensure the existing `infra/staging/compose.yml` can run with restricted filesystem, secrets and private networking. The repository currently has a compose **template**, not a verified OCI deployment. Keep `MARKETING_EXTERNAL_EFFECTS_ENABLED=false` and all real provider/AI/email/publishing flags false.
7. Supply secrets from an operator-controlled vault or private envfiles; **never** put runtime credentials, PostgreSQL migration privileges or provider tokens in tracked files. Use a restricted non-BYPASSRLS app role and FORCE RLS on all tenant tables. Migration/backup roles must be separate.
8. Run `node scripts/quality/oracle-always-free-profile.mjs --profile infra/staging/oracle-always-free.profile.example.json` for the **static budget check**; then the existing `apps/api/scripts/t1e-staging-preflight.mjs` with real environment. Neither proves that the VM exists, TLS works, image builds, or that operator authentication succeeded.
9. Perform actual external health, HTTPS/OIDC, tenant and agency isolation, egress-denial, backup/restore, and 24-hour independent staging observation. Use the existing T6B independent staging evidence and T7A QA packets, and keep `NOT_CERTIFIED` until signed independent 500-case QA, pentest, DR and official provider UAT are complete.

## Known architectural constraint
A single free VM is **not** independent infrastructure or production-grade HA. A same-host PostgreSQL backup is not independent disaster recovery. The T1E `sslmode=verify-full` non-loopback database policy may require a separate private endpoint and certificate setup; do **not** loosen it to make a one-VM configuration appear ready. If this cannot be achieved within Always Free capacity, report the blocker and request approval for an alternative. No external accounts or infrastructure have been created.

## Execution boundary
This tranche prepares and validates an OCI target profile only. **Not deployed.** The operator must create the tenancy and grant controlled access before a real VM can be provisioned. Never claim the 500 independent cases or staging 24-hour attestation are completed without external evidence.
