-- R1B additive policy table; no change to the existing User role ceiling.
CREATE TABLE "TenantRoleDefinition" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "key" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "permissions" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "TenantRoleDefinition_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TenantRoleDefinition_status_check" CHECK ("status" IN ('ACTIVE','DISABLED')),
 CONSTRAINT "TenantRoleDefinition_permissions_array_check" CHECK (jsonb_typeof("permissions") = 'array')
);
CREATE UNIQUE INDEX "TenantRoleDefinition_organizationId_key_key" ON "TenantRoleDefinition"("organizationId","key");
CREATE UNIQUE INDEX "TenantRoleDefinition_organizationId_id_key" ON "TenantRoleDefinition"("organizationId","id");
CREATE INDEX "TenantRoleDefinition_organizationId_status_idx" ON "TenantRoleDefinition"("organizationId","status");
ALTER TABLE "TenantRoleDefinition" ADD CONSTRAINT "TenantRoleDefinition_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "tenantRoleDefinitionId" TEXT;
CREATE INDEX "User_organizationId_tenantRoleDefinitionId_idx"
 ON "User"("organizationId","tenantRoleDefinitionId");
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_tenantRoleDefinitionId_fkey"
 FOREIGN KEY ("organizationId","tenantRoleDefinitionId")
 REFERENCES "TenantRoleDefinition"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The role-policy read/write owner always sets transaction-local tenant
-- context. FORCE RLS applies even to a normal table owner role.
ALTER TABLE "TenantRoleDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantRoleDefinition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TenantRoleDefinition_tenant_select" ON "TenantRoleDefinition"
 FOR SELECT USING ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "TenantRoleDefinition_tenant_insert" ON "TenantRoleDefinition"
 FOR INSERT WITH CHECK ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "TenantRoleDefinition_tenant_update" ON "TenantRoleDefinition"
 FOR UPDATE USING ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''))
 WITH CHECK ("organizationId" = nullif(current_setting('app.marketing_tenant_id',true),''));
CREATE POLICY "TenantRoleDefinition_tenant_delete_deny" ON "TenantRoleDefinition"
 AS RESTRICTIVE FOR DELETE USING (false);
