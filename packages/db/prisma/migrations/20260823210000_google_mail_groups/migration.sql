-- Google Workspace: de eigen adressen van de kring (activiteiten@vtk.be, ...).
-- Zie docs/design-decisions.md, "Google Workspace: postadressen, accounts en de
-- kiesploeg". De koppeling met het @vtk.be-account staat op de gebruiker; op
-- naam matchen doen we bewust nooit.

-- CreateEnum
CREATE TYPE "MailGroupExtraKind" AS ENUM ('INCLUDE', 'EXCLUDE');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "googleUserId" TEXT,
ADD COLUMN "googleEmail" TEXT,
ADD COLUMN "googleLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MailGroup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "googleId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowExternalSenders" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastMemberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailGroupSource" (
    "id" TEXT NOT NULL,
    "mailGroupId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "onlyLead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MailGroupSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailGroupExtra" (
    "id" TEXT NOT NULL,
    "mailGroupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" "MailGroupExtraKind" NOT NULL DEFAULT 'INCLUDE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailGroupExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleUserId_key" ON "User"("googleUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleEmail_key" ON "User"("googleEmail");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroup_email_key" ON "MailGroup"("email");

-- CreateIndex
CREATE INDEX "MailGroup_enabled_idx" ON "MailGroup"("enabled");

-- CreateIndex
CREATE INDEX "MailGroupSource_groupId_idx" ON "MailGroupSource"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupSource_mailGroupId_groupId_onlyLead_key" ON "MailGroupSource"("mailGroupId", "groupId", "onlyLead");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupExtra_mailGroupId_email_key" ON "MailGroupExtra"("mailGroupId", "email");

-- AddForeignKey
ALTER TABLE "MailGroupSource" ADD CONSTRAINT "MailGroupSource_mailGroupId_fkey" FOREIGN KEY ("mailGroupId") REFERENCES "MailGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroupSource" ADD CONSTRAINT "MailGroupSource_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroupExtra" ADD CONSTRAINT "MailGroupExtra_mailGroupId_fkey" FOREIGN KEY ("mailGroupId") REFERENCES "MailGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
