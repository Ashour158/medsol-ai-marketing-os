-- Existing spentMicros/actualMicros are policy price estimates, not verified provider billing.
ALTER TABLE "ModelUsage" ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "ModelUsage" ADD COLUMN "verifiedBilledMicros" BIGINT;
ALTER TABLE "ModelUsage" ADD COLUMN "billedEvidenceReference" TEXT;
ALTER TABLE "ModelUsage" ADD COLUMN "billedVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_verified_billing_complete"
 CHECK (("billingStatus" <> 'VERIFIED') OR ("verifiedBilledMicros" IS NOT NULL AND "billedEvidenceReference" IS NOT NULL AND "billedVerifiedAt" IS NOT NULL));
