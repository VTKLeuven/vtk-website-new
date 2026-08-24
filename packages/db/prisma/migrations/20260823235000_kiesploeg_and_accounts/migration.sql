-- Kiesploeg, accounts aanmaken en de verplichte accountkoppeling.
-- Zie docs/design-decisions.md, "Google Workspace: postadressen, accounts en de
-- kiesploeg".

-- CreateEnum
CREATE TYPE "GoogleAccountState" AS ENUM ('RESTRICTED', 'FULL');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "googleLinkDeferredAt" TIMESTAMP(3),
ADD COLUMN "googleAccountState" "GoogleAccountState";

-- CreateTable
CREATE TABLE "Kiesploeg" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "workingYear" INTEGER NOT NULL,
    "formalName" TEXT NOT NULL,
    "informalName" TEXT,
    "accountTemplate" TEXT NOT NULL DEFAULT '{voornaam}.{achternaam}',
    "aliasTemplate" TEXT NOT NULL DEFAULT 'kiesploeg{code}.{voornaam}.{achternaam}',
    "listTemplate" TEXT NOT NULL DEFAULT '{post}.{code}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kiesploeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KiesploegPost" (
    "id" TEXT NOT NULL,
    "kiesploegId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isG5" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KiesploegPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KiesploegMember" (
    "id" TEXT NOT NULL,
    "kiesploegId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "mailboxActive" BOOLEAN NOT NULL DEFAULT false,
    "forwardTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiesploegMember_pkey" PRIMARY KEY ("id")
);

-- Een bron van een groepsadres kan voortaan ook een kiesploeg of een post
-- binnen een kiesploeg zijn; daarom mag `groupId` leeg staan.
-- AlterTable
ALTER TABLE "MailGroupSource"
ALTER COLUMN "groupId" DROP NOT NULL,
ADD COLUMN "kiesploegId" TEXT,
ADD COLUMN "kiesploegPostId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Kiesploeg_code_key" ON "Kiesploeg"("code");

-- CreateIndex
CREATE INDEX "KiesploegPost_kiesploegId_idx" ON "KiesploegPost"("kiesploegId");

-- CreateIndex
CREATE UNIQUE INDEX "KiesploegPost_kiesploegId_code_key" ON "KiesploegPost"("kiesploegId", "code");

-- CreateIndex
CREATE INDEX "KiesploegMember_userId_idx" ON "KiesploegMember"("userId");

-- CreateIndex
CREATE INDEX "KiesploegMember_postId_idx" ON "KiesploegMember"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "KiesploegMember_kiesploegId_userId_key" ON "KiesploegMember"("kiesploegId", "userId");

-- CreateIndex
CREATE INDEX "MailGroupSource_kiesploegId_idx" ON "MailGroupSource"("kiesploegId");

-- CreateIndex
CREATE INDEX "MailGroupSource_kiesploegPostId_idx" ON "MailGroupSource"("kiesploegPostId");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupSource_mailGroupId_kiesploegId_onlyLead_key" ON "MailGroupSource"("mailGroupId", "kiesploegId", "onlyLead");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupSource_mailGroupId_kiesploegPostId_onlyLead_key" ON "MailGroupSource"("mailGroupId", "kiesploegPostId", "onlyLead");

-- AddForeignKey
ALTER TABLE "KiesploegPost" ADD CONSTRAINT "KiesploegPost_kiesploegId_fkey" FOREIGN KEY ("kiesploegId") REFERENCES "Kiesploeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiesploegMember" ADD CONSTRAINT "KiesploegMember_kiesploegId_fkey" FOREIGN KEY ("kiesploegId") REFERENCES "Kiesploeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiesploegMember" ADD CONSTRAINT "KiesploegMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiesploegMember" ADD CONSTRAINT "KiesploegMember_postId_fkey" FOREIGN KEY ("postId") REFERENCES "KiesploegPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroupSource" ADD CONSTRAINT "MailGroupSource_kiesploegId_fkey" FOREIGN KEY ("kiesploegId") REFERENCES "Kiesploeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroupSource" ADD CONSTRAINT "MailGroupSource_kiesploegPostId_fkey" FOREIGN KEY ("kiesploegPostId") REFERENCES "KiesploegPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
