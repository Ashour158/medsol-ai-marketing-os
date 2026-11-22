# T7C — Free GitHub-only engineering rehearsal (Oracle sign-in deferred)

**Selected provider:** GitHub, already hosting this personal-account repository. **Release: NOT_CERTIFIED.** No public persistent staging, new cloud provider account, paid compute, third-party credentials or live marketing effects are needed.

## Reuse Map

- **GitHub Actions `.github/workflows/ci.yml`** remains the sole full real-stack CI acceptance workflow. T7C only enables manual `workflow_dispatch` of the existing verification; it does **not** add a second QA workflow or independent human acceptance authority.
- **R3Y / T1F / T3C / T3D / T4A** continue to own the actual PostgreSQL, signed OIDC, compiled Nest/Next, Chromium, creative and knowledge/DAG evidence. They use disposable test credentials and services, not public production systems.
- **T7A** owns unsigned 500-case operator packets; **T6B** remains the signed independent production-release decision. CI results cannot satisfy the 24-hour persistent staging, independent 500 E2E, pentest or DR gates.
- **T1E** remains the actual persistent staging deployment and security policy. This Codespaces setup is developer tooling only, not an alternate production auth system.

## Use it now without another cloud sign-in

1. On the existing GitHub repository open **Actions → CI → Run workflow → main**. This runs the already-proven real PostgreSQL, non-BYPASSRLS tenant isolation, compiled API/frontend, signed disposable OIDC, Chromium operator journeys, evidence/backup restore and dependency checks. Results and unsigned evidence are in the GitHub Actions run artifacts. No social/email/AI credentials are configured.
2. For interactive engineering and local debugging, open **Code → Codespaces → Create codespace on main**. The `.devcontainer/devcontainer.json` installs Node 22, pnpm 10.12.4, Prisma and the workspace packages, and enables local Docker. Select the **smallest 2-core** available machine and keep the forwarded port 3000 **Private**.
3. For local code quality, run `pnpm typecheck` and `pnpm test` inside Codespaces. To run PostgreSQL-backed browser E2E, use the documented full CI workflow; do not infer that a bare `pnpm dev` provides valid staging OIDC, restricted DB role or production HTTPS. The Codespace is not automatically a signed-in demo or independently observed deployment.
4. Review Codespaces monthly included usage in GitHub Billing. GitHub Free personal accounts list **120 core-hours** (60 runtime hours on a 2-core machine) and **15 GB-month** storage; eligibility and remaining allowance are account-dependent. Stop/delete the Codespace when finished and disable paid overage (budget **Stop usage when budget limit is reached** where available). No guaranteed unlimited free runtime.
5. **Never** make the app port public for convenience; private Codespaces ports are only available to the signed-in GitHub owner. Do not put production data, API tokens, OIDC private keys or customer data in this public repository, Codespace or test artifacts.

## Why this works and what it does not

GitHub Actions has already executed the real-stack test suite successfully on this repository. A manually triggered run exercises the same workflow without any Oracle account. Codespaces adds a browser-accessible cloud development environment, subject to quota and idle suspension.

**This is a free engineering/testing fallback, NOT persistent enterprise staging.** It cannot satisfy T6B's two independent observations >=24 hours apart, stable public HTTPS staging domain, independently operated MFA IdP, independent 500-case signoff, penetration testing or disaster recovery. Do not relabel CI evidence as operator certification.

## Sources
- https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-included-usage
- https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
- https://docs.github.com/en/billing/reference/product-usage-included
