# R2D — Secure versioned media storage, readback and malware evidence

**Delivery classification:** Implementation of a server-side AWS S3 Object Lock + SSE-KMS adapter and ClamAV Unix socket scanner, plus integration with canonical DAM and VerifiedMediaEvidence. Deployment **requires** a configured bucket, KMS key, runtime IAM role, clamd service and staging validation. No live external posting or user-facing upload API is enabled.

## Reuse Map
| Concept | Authoritative owner | R2D addition |
| --- | --- | --- |
| Asset and immutable revision metadata | CreativeAssetService / CreativeAssetRevision | Existing `addRevision` used unchanged by trusted registration coordinator |
| Authoritative readback proof and revocation | VerifiedMediaEvidenceService / VerifiedMediaEvidence | Add immutable scan fields and enforce scan status at publication preflight |
| Binary storage | VersionedMediaReader backend port | Add AWS S3 implementation, not a second asset or evidence store |
| Malware screening | Host-managed ClamAV | Read/write scanner adapter, not an AI judgment |
| Campaign and provider delivery authorization | CampaignPublicationService | Read-only diagnostics only; external effects remain blocked |
| Tenant IAM / audit | Existing guards, AuditEvent and PostgreSQL tenant context | Reused; no new credentials or tenant identity |

## Storage contract
- Backend only, AWS SDK credential provider chain (workload IAM); no HTTP access to arbitrary endpoints, no user-supplied credentials, no account-level bucket selection.
- One fixed private bucket and KMS key per deployment, with server-side encryption `aws:kms`, S3 Object Lock **COMPLIANCE** retention at least 30 days and mandatory non-null object VersionId.
- Opaque `internal:creative-source/<uuid>` maps to `tenants/<organizationId>/creative-source/<uuid>`; key formation refuses traversal, URLs, arbitrary paths and cross-tenant scope.
- Server receives bounded 16-byte to 24 MiB PNG/JPEG/WebP signatures, requires declared MIME to match, scans **before** conditional (`If-None-Match: *`) upload, and reads back stored bytes and independent KMS/lock/version metadata before DAM registration.
- Bounded streaming GET verifies length, lock retention, KMS ARN and object version, **rescans** bytes with clamd and computes SHA-256 rather than trusting ETag, user digests or headers.
- The trusted coordinator calls existing `CreativeAssetService.addRevision` then `VerifiedMediaEvidenceService.verifyReadback`. It cannot grant rights approval, issue external publication or bypass existing Brand Master approval.
- External object PUT and DB registration are not one transaction: failed DAM registration may leave an immutable orphan. Reconcile this through an operator-controlled orphan inventory, legal retention and eventual GC; never silently create a second revision on retries.

## Evidence, immutable provenance and legacy behavior
- `VerifiedMediaEvidence.malwareScanStatus` is `NOT_SCANNED` for all historical R2B evidence, and `CLEAN` only after an explicitly trusted scan response. `scannerId` is stored as immutable provenance.
- New rows cannot be promoted later; an existing NOT_SCANNED observation cannot be rewritten CLEAN. A new governed asset revision is required.
- The database upgrades the authoritative evidence mutation trigger to protect scanner provenance and adds a deletion-deny trigger effective even for the DB table owner.
- R2 publication preflight now exposes `mediaMalwareScanClean`; the mere presence of signature-only evidence does not imply screening, rights, consent, or external posting authority.

## Required deployment configuration
- `MARKETING_MEDIA_S3_BUCKET`: dedicated, private, bucket-owner-enforced S3 Object Lock bucket, versioning enabled before use.
- `MARKETING_MEDIA_S3_REGION`: approved AWS region and account boundary.
- `MARKETING_MEDIA_S3_KMS_KEY_ARN`: dedicated regional KMS key ARN accessible to the media worker role.
- `MARKETING_MEDIA_S3_OBJECT_LOCK_DAYS`: 30 to 3650 days, consistent with legal and record retention.
- `MARKETING_CLAMAV_SOCKET`: local Unix-domain socket to actively monitored clamd with regular signature updates.
- Deployment IAM: least-privilege `s3:PutObject`, `s3:GetObject`, `s3:GetObjectVersion`, required retention permissions and KMS `GenerateDataKey`/`Decrypt`, restricted to the bucket, prefix and worker principal. Deny public access, unencrypted writes, non-compliance locks, and administrative bypass of retention.

## Required acceptance (staging)
1. Provision real AWS bucket with versioning and Object Lock at creation, KMS grants, least-privilege role and clamd.
2. Verify egress, trust boundaries, account/region pinning, malware updates and alerting.
3. Upload a clean test asset, observe non-null VersionId, correct lock mode/retention and matching S3 GET bytes; exercise a known AV test fixture in isolated staging.
4. Deny malicious file, corrupted stream, missing KMS, wrong tenant, disabled scanner, readback failure, object replacement and revoked proof.
5. Run clean/historical migrations, Prisma drift, all repository tests, and production backup/restore simulation.
6. Confirm public BFF/API exposes **no** raw upload, arbitrary S3 read, scan assertion or external publish endpoint from this tranche.

## Explicit remaining blockers
This is a deployable server-side storage implementation, **not** evidence that AWS infrastructure, malware-daemon operations, real media decoding/EXIF sanitization, CDN serving, provider account ownership or provider receipt verification are running. No production provider credentials, tenant web upload flows, or external send capability are configured. All publication effects stay denied.
