# Security evidence register — Medsol AI Marketing OS

**Evidence classification:** scanner-generated, not a security certification. This register points to real GitHub Actions artifacts produced by the existing `security-evidence` job. It does not contain fabricated scans, static SBOM copies or security claims.

| CI commit/run | Actual artifact | Evidence | Initial result |
| --- | --- | --- | --- |
| [44320547067](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44320547067) | `medsol-security-evidence-44320547067` | Syft SPDX SBOM; `pnpm audit --json`, stderr, exit code | 2 critical / 2 high / 3 moderate |
| [44321339163](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44321339163) | `medsol-security-evidence-44321339163` | Repeat scan after dependency updates | 0 critical / 1 high / 0 moderate |
| [44321949614](https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/44321949614) | `medsol-security-evidence-44321949614` | Merged-main security evidence with same scan mechanism | Validate the artifact itself before an approval decision |

Artifacts have 30-day retention and may expire around December 18, 2026. Download through the run's **Artifacts** section while available. Do not confuse the `security-evidence` job's green completion with `pnpm audit` returning 0: the job preserves nonzero audit statuses for review.

## Mandatory release interpretation

- The unresolved high-severity `picomatch` test-dependency finding (GHSA-fc5q-39xc-vjpf) is tracked in [issue #4](https://github.com/Ashour158/medsol-ai-marketing-os/issues/4).
- The scanner artifact is independent of the ECC bot's changed-file reference-set classification. Its presence may not count as a checked-in evidence file.
- An SBOM identifies dependencies; it does not verify that runtime dependencies are vulnerability-free, that secrets are protected, that production identity is configured, or that an external scanner reviewed all code paths.
- SARIF, AgentShield attestation, penetration tests, licence approval and incident-response exercises are **not available** as completed evidence here.
- Before any production release: verify an intact current scan, review applicable advisory exposure, obtain approval of any time-bounded exceptions, and preserve the corresponding artifact with longer-term authorized storage.
