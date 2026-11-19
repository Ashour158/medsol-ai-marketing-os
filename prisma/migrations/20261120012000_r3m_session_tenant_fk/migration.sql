-- R3-M: AuthSession must refer to an actual User IN THE SAME tenant.
-- Existing bootstrap OIDC guard checks the subject and the session at read
-- time; this adds the database authority that an orphan or foreign-tenant
-- session can never be stored by a misconfigured migration or internal job.
-- Historical orphan sessions cause a migration validation failure; no
-- session or identity is silently migrated across tenants.
CREATE UNIQUE INDEX "User_organizationId_id_key"
 ON "User"("organizationId","id");
ALTER TABLE "AuthSession"
 ADD CONSTRAINT "AuthSession_organizationId_userId_fkey"
 FOREIGN KEY ("organizationId","userId")
 REFERENCES "User"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
