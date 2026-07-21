-- CreateEnum
CREATE TYPE "SsoAccessMode" AS ENUM ('OPEN', 'RESTRICTED');

-- AlterTable
-- Bestaande clients blijven bewust OPEN: deze migratie mag niemand buitensluiten.
ALTER TABLE "oauthClient" ADD COLUMN     "accessMode" "SsoAccessMode" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "permissionNamespace" TEXT;

-- CreateTable
CREATE TABLE "SsoClientPermission" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoClientPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoUserClientPermission" (
    "id" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "SsoUserClientPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoRoleClientPermission" (
    "id" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoRoleClientPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoGroupClientPermission" (
    "id" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" "RoleGrantKind" NOT NULL DEFAULT 'DEFAULT',
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoGroupClientPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SsoClientPermission_clientId_deprecated_idx" ON "SsoClientPermission"("clientId", "deprecated");

-- CreateIndex
CREATE UNIQUE INDEX "SsoClientPermission_clientId_code_key" ON "SsoClientPermission"("clientId", "code");

-- CreateIndex
CREATE INDEX "SsoUserClientPermission_userId_clientId_idx" ON "SsoUserClientPermission"("userId", "clientId");

-- CreateIndex
CREATE INDEX "SsoUserClientPermission_clientId_idx" ON "SsoUserClientPermission"("clientId");

-- CreateIndex
CREATE INDEX "SsoUserClientPermission_expiresAt_idx" ON "SsoUserClientPermission"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SsoUserClientPermission_permissionId_userId_key" ON "SsoUserClientPermission"("permissionId", "userId");

-- CreateIndex
CREATE INDEX "SsoRoleClientPermission_roleId_clientId_idx" ON "SsoRoleClientPermission"("roleId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoRoleClientPermission_permissionId_roleId_key" ON "SsoRoleClientPermission"("permissionId", "roleId");

-- CreateIndex
CREATE INDEX "SsoGroupClientPermission_groupId_clientId_idx" ON "SsoGroupClientPermission"("groupId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoGroupClientPermission_permissionId_groupId_kind_key" ON "SsoGroupClientPermission"("permissionId", "groupId", "kind");

-- AddForeignKey
ALTER TABLE "SsoClientPermission" ADD CONSTRAINT "SsoClientPermission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoUserClientPermission" ADD CONSTRAINT "SsoUserClientPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "SsoClientPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoUserClientPermission" ADD CONSTRAINT "SsoUserClientPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoRoleClientPermission" ADD CONSTRAINT "SsoRoleClientPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "SsoClientPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoRoleClientPermission" ADD CONSTRAINT "SsoRoleClientPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoGroupClientPermission" ADD CONSTRAINT "SsoGroupClientPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "SsoClientPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoGroupClientPermission" ADD CONSTRAINT "SsoGroupClientPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
