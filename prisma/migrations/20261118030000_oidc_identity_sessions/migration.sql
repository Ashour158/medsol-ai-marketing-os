ALTER TABLE "User" ADD COLUMN "oidcSubject" TEXT;
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_organizationId_oidcSubject_key" ON "User"("organizationId", "oidcSubject");

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthSession_organizationId_userId_revokedAt_expiresAt_idx" ON "AuthSession"("organizationId", "userId", "revokedAt", "expiresAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
