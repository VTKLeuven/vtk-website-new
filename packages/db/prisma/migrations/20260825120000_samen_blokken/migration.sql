-- Samen blokken: studietijd meten en naast die van je vrienden zetten.
--
-- Vier tabellen: de sessie zelf, de groep, wie erin zit, en wat een lid voor
-- zichzelf instelde. Geen enkele bestaande tabel wordt aangeraakt.

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT,
    "subjectHidden" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "pausedAt" TIMESTAMPTZ(3),
    "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "seconds" INTEGER,
    "endedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" TEXT,
    "weeklyGoalMinutes" INTEGER,
    "startPushAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyProfile" (
    "userId" TEXT NOT NULL,
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 240,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudyProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "StudySession_userId_startedAt_idx" ON "StudySession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "StudySession_endedAt_lastSeenAt_idx" ON "StudySession"("endedAt", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyGroup_code_key" ON "StudyGroup"("code");

-- CreateIndex
CREATE INDEX "StudyGroupMember_userId_idx" ON "StudyGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyGroupMember_groupId_userId_key" ON "StudyGroupMember"("groupId", "userId");

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGroup" ADD CONSTRAINT "StudyGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGroupMember" ADD CONSTRAINT "StudyGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGroupMember" ADD CONSTRAINT "StudyGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyProfile" ADD CONSTRAINT "StudyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

