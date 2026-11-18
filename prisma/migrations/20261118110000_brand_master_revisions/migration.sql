CREATE TABLE "BrandMasterRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sourceReference" TEXT NOT NULL,
  "rules" JSONB NOT NULL,
  "proposedBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandMasterRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandMasterRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BrandMasterRevision_release_state" CHECK (
    ("status" = 'DRAFT' AND "approvedBy" IS NULL AND "approvedAt" IS NULL)
    OR ("status" = 'APPROVED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)
    OR ("status" = 'REJECTED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "BrandMasterRevision_organizationId_version_key" ON "BrandMasterRevision"("organizationId","version");
CREATE INDEX "BrandMasterRevision_organizationId_status_version_idx" ON "BrandMasterRevision"("organizationId","status","version");
