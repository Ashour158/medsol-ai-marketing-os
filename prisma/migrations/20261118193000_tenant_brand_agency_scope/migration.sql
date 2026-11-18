-- R1 additive tenancy capability. Does not change, merge or impersonate tenants.
CREATE TABLE "Brand" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Brand_organizationId_slug_key" ON "Brand"("organizationId","slug");
CREATE UNIQUE INDEX "Brand_organizationId_id_key" ON "Brand"("organizationId","id");
CREATE INDEX "Brand_organizationId_status_idx" ON "Brand"("organizationId","status");
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AgencyGrant is a revocable scoped relationship, not identity membership.
CREATE TABLE "AgencyGrant" (
  "id" TEXT NOT NULL,
  "clientOrganizationId" TEXT NOT NULL,
  "agencyOrganizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "actions" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "revokedBy" TEXT,
  "revokedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgencyGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgencyGrant_expires_future" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "AgencyGrant_different_tenants" CHECK ("clientOrganizationId" <> "agencyOrganizationId")
);
CREATE UNIQUE INDEX "AgencyGrant_scope_key"
 ON "AgencyGrant"("clientOrganizationId","agencyOrganizationId","brandId");
CREATE INDEX "AgencyGrant_clientOrganizationId_status_expiresAt_idx"
 ON "AgencyGrant"("clientOrganizationId","status","expiresAt");
CREATE INDEX "AgencyGrant_agencyOrganizationId_status_expiresAt_idx"
 ON "AgencyGrant"("agencyOrganizationId","status","expiresAt");
ALTER TABLE "AgencyGrant" ADD CONSTRAINT "AgencyGrant_clientOrganizationId_fkey"
 FOREIGN KEY ("clientOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgencyGrant" ADD CONSTRAINT "AgencyGrant_agencyOrganizationId_fkey"
 FOREIGN KEY ("agencyOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgencyGrant" ADD CONSTRAINT "AgencyGrant_clientOrganizationId_brandId_fkey"
 FOREIGN KEY ("clientOrganizationId","brandId") REFERENCES "Brand"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
