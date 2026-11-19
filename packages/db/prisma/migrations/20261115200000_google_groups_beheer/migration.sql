-- Groepsadressen volledig vanuit de site beheren: bestaande Google-groepen
-- overnemen, jaargroepen (activiteiten_2627 in activiteiten@vtk.be), POC-lijsten,
-- werkgroepen die hun eigen lijsten en accounts beheren, en de kiesploeg met
-- een derde accountstaat (mailen enkel vanaf het kiesploegadres).
--
-- Wat er met bestaande rijen gebeurt:
-- - KiesploegMember.mailboxActive wordt hernoemd tot sendFromAlias en houdt
--   zijn waarde: wie "mag nu al mailen" had, mag dat blijven, nu vanaf zijn
--   kiesploegadres. aliasEmail blijft leeg; de sync valt dan terug op het
--   sjabloon van de ploeg.
-- - Bestaande kiesploegen houden hun adressjablonen; enkel de standaard voor
--   een nieuwe ploeg verandert (voornaam.naam.kiesploegepsilon, epsilon.g5).
-- - Bestaande groepsadressen krijgen geen eigenaar, geen jaar en geen
--   jaargroepen: ze gedragen zich exact zoals voorheen.
-- - Bestaande losse adressen blijven een adres (userId leeg).
-- - Poc.mailYear blijft leeg: een POC-lijst volgt dan het huidige werkingsjaar
--   tot iemand de knop "verkozen" gebruikt.
-- - Nieuwe tabel WerkgroepAccount: nul rijen.

-- CreateEnum
CREATE TYPE "WerkgroepAccountStatus" AS ENUM ('REQUESTED', 'REJECTED', 'ACTIVE', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "GoogleAccountState" ADD VALUE 'ALIAS_SENDER';
ALTER TYPE "GoogleAccountState" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "mailPrefix" TEXT;

-- AlterTable
ALTER TABLE "Kiesploeg" ADD COLUMN     "transitionedAt" TIMESTAMP(3),
ALTER COLUMN "aliasTemplate" SET DEFAULT '{voornaam}.{achternaam}.kiesploeg{code}',
ALTER COLUMN "listTemplate" SET DEFAULT '{code}.{post}';

-- AlterTable
ALTER TABLE "KiesploegMember" RENAME COLUMN "mailboxActive" TO "sendFromAlias";
ALTER TABLE "KiesploegMember" ADD COLUMN     "aliasEmail" TEXT,
ADD COLUMN     "aliasRemovedAt" TIMESTAMP(3),
ADD COLUMN     "keepAccount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MailGroup" ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "ownerGroupId" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "year" INTEGER,
ADD COLUMN     "yearlyGroupId" TEXT,
ADD COLUMN     "yearlyTemplate" TEXT;

-- AlterTable
ALTER TABLE "MailGroupExtra" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- Precies één van de twee: een adres of een lid.
ALTER TABLE "MailGroupExtra" ADD CONSTRAINT "MailGroupExtra_email_or_user"
  CHECK (("email" IS NULL) <> ("userId" IS NULL));

-- AlterTable
ALTER TABLE "MailGroupSource" ADD COLUMN     "pocId" TEXT;

-- AlterTable
ALTER TABLE "Poc" ADD COLUMN     "mailYear" INTEGER;

-- CreateTable
CREATE TABLE "WerkgroepAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleUserId" TEXT,
    "status" "WerkgroepAccountStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,

    CONSTRAINT "WerkgroepAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WerkgroepAccount_email_key" ON "WerkgroepAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WerkgroepAccount_googleUserId_key" ON "WerkgroepAccount"("googleUserId");

-- CreateIndex
CREATE INDEX "WerkgroepAccount_groupId_idx" ON "WerkgroepAccount"("groupId");

-- CreateIndex
CREATE INDEX "WerkgroepAccount_status_idx" ON "WerkgroepAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WerkgroepAccount_userId_groupId_key" ON "WerkgroepAccount"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_mailPrefix_key" ON "Group"("mailPrefix");

-- CreateIndex
CREATE INDEX "MailGroup_ownerGroupId_idx" ON "MailGroup"("ownerGroupId");

-- CreateIndex
CREATE INDEX "MailGroup_parentId_idx" ON "MailGroup"("parentId");

-- CreateIndex
CREATE INDEX "MailGroupExtra_userId_idx" ON "MailGroupExtra"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupExtra_mailGroupId_userId_key" ON "MailGroupExtra"("mailGroupId", "userId");

-- CreateIndex
CREATE INDEX "MailGroupSource_pocId_idx" ON "MailGroupSource"("pocId");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupSource_mailGroupId_pocId_onlyLead_key" ON "MailGroupSource"("mailGroupId", "pocId", "onlyLead");

-- AddForeignKey
ALTER TABLE "MailGroup" ADD CONSTRAINT "MailGroup_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroup" ADD CONSTRAINT "MailGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MailGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroup" ADD CONSTRAINT "MailGroup_yearlyGroupId_fkey" FOREIGN KEY ("yearlyGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroupSource" ADD CONSTRAINT "MailGroupSource_pocId_fkey" FOREIGN KEY ("pocId") REFERENCES "Poc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroupExtra" ADD CONSTRAINT "MailGroupExtra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WerkgroepAccount" ADD CONSTRAINT "WerkgroepAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WerkgroepAccount" ADD CONSTRAINT "WerkgroepAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WerkgroepAccount" ADD CONSTRAINT "WerkgroepAccount_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WerkgroepAccount" ADD CONSTRAINT "WerkgroepAccount_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

