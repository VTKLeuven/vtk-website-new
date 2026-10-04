-- PAL+: peer assisted learning op aanvraag. Een lid biedt aan een sessie te
-- geven of vraagt hulp bij een vak, VTK Onderwijs maakt er sessies van met een
-- lokaal, en de tutors krijgen na afloop bonnetjes zonder dat het een shift is.
-- Zie docs/design-decisions.md ("PAL+").
--
-- Enkel nieuwe tabellen: er bestaan nog geen rijen, dus er valt niets te
-- backfillen.

-- CreateEnum
CREATE TYPE "PalPlusRequestKind" AS ENUM ('GIVE', 'FOLLOW');

-- CreateEnum
CREATE TYPE "PalPlusRequestStatus" AS ENUM ('PENDING', 'OPEN', 'PLANNED', 'CLOSED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "PalPlusCourse" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PalPlusCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalPlusRequest" (
    "id" TEXT NOT NULL,
    "kind" "PalPlusRequestKind" NOT NULL,
    "status" "PalPlusRequestStatus" NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "courseOther" TEXT,
    "description" TEXT NOT NULL,
    "proposedStartsAt" TIMESTAMPTZ(3),
    "proposedEndsAt" TIMESTAMPTZ(3),
    "preferredPeriod" TEXT,
    "respondsToId" TEXT,
    "sessionId" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PalPlusRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalPlusRequestBacker" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PalPlusRequestBacker_pkey" PRIMARY KEY ("requestId","userId")
);

-- CreateTable
CREATE TABLE "PalPlusSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "maxParticipants" INTEGER,
    "roomId" TEXT,
    "roomText" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PalPlusSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalPlusSessionTutor" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "rewardPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardCorrectedAt" TIMESTAMPTZ(3),
    "rewardCorrectedById" TEXT,
    "rewardNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PalPlusSessionTutor_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "PalPlusSessionAttendee" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attended" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PalPlusSessionAttendee_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PalPlusCourse_code_key" ON "PalPlusCourse"("code");

-- CreateIndex
CREATE INDEX "PalPlusCourse_active_nameNl_idx" ON "PalPlusCourse"("active", "nameNl");

-- CreateIndex
CREATE INDEX "PalPlusRequest_kind_status_createdAt_idx" ON "PalPlusRequest"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PalPlusRequest_userId_idx" ON "PalPlusRequest"("userId");

-- CreateIndex
CREATE INDEX "PalPlusRequest_courseId_status_idx" ON "PalPlusRequest"("courseId", "status");

-- CreateIndex
CREATE INDEX "PalPlusRequest_sessionId_idx" ON "PalPlusRequest"("sessionId");

-- CreateIndex
CREATE INDEX "PalPlusRequest_respondsToId_idx" ON "PalPlusRequest"("respondsToId");

-- CreateIndex
CREATE INDEX "PalPlusRequestBacker_userId_idx" ON "PalPlusRequestBacker"("userId");

-- CreateIndex
CREATE INDEX "PalPlusSession_startsAt_idx" ON "PalPlusSession"("startsAt");

-- CreateIndex
CREATE INDEX "PalPlusSession_courseId_startsAt_idx" ON "PalPlusSession"("courseId", "startsAt");

-- CreateIndex
CREATE INDEX "PalPlusSessionTutor_userId_idx" ON "PalPlusSessionTutor"("userId");

-- CreateIndex
CREATE INDEX "PalPlusSessionAttendee_userId_idx" ON "PalPlusSessionAttendee"("userId");

-- AddForeignKey
ALTER TABLE "PalPlusRequest" ADD CONSTRAINT "PalPlusRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusRequest" ADD CONSTRAINT "PalPlusRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "PalPlusCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusRequest" ADD CONSTRAINT "PalPlusRequest_respondsToId_fkey" FOREIGN KEY ("respondsToId") REFERENCES "PalPlusRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusRequest" ADD CONSTRAINT "PalPlusRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PalPlusSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusRequest" ADD CONSTRAINT "PalPlusRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusRequestBacker" ADD CONSTRAINT "PalPlusRequestBacker_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PalPlusRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusRequestBacker" ADD CONSTRAINT "PalPlusRequestBacker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSession" ADD CONSTRAINT "PalPlusSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "PalPlusCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSession" ADD CONSTRAINT "PalPlusSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSession" ADD CONSTRAINT "PalPlusSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSessionTutor" ADD CONSTRAINT "PalPlusSessionTutor_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PalPlusSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSessionTutor" ADD CONSTRAINT "PalPlusSessionTutor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSessionTutor" ADD CONSTRAINT "PalPlusSessionTutor_rewardCorrectedById_fkey" FOREIGN KEY ("rewardCorrectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSessionAttendee" ADD CONSTRAINT "PalPlusSessionAttendee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PalPlusSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalPlusSessionAttendee" ADD CONSTRAINT "PalPlusSessionAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Regels die Prisma niet kan uitdrukken.
--
-- Een aanvraag hangt aan een vak uit de lijst of aan een vrij ingevuld vak.
ALTER TABLE "PalPlusRequest"
    ADD CONSTRAINT "PalPlusRequest_course_check" CHECK ("courseId" IS NOT NULL OR "courseOther" IS NOT NULL),
    ADD CONSTRAINT "PalPlusRequest_proposed_check" CHECK ("proposedStartsAt" IS NULL OR "proposedEndsAt" IS NULL OR "proposedEndsAt" > "proposedStartsAt");

ALTER TABLE "PalPlusSession"
    ADD CONSTRAINT "PalPlusSession_dates_check" CHECK ("endsAt" > "startsAt"),
    ADD CONSTRAINT "PalPlusSession_max_check" CHECK ("maxParticipants" IS NULL OR "maxParticipants" > 0);

-- Zoals bij `ShiftParticipant`: nooit negatief. Een correctie die onder wat al
-- uitgegeven is zakt, verschuift het verschil naar andere bonnetjes of laat het
-- vallen; ze zet hier geen negatief getal.
ALTER TABLE "PalPlusSessionTutor"
    ADD CONSTRAINT "PalPlusSessionTutor_reward_nonnegative" CHECK ("reward" >= 0),
    ADD CONSTRAINT "PalPlusSessionTutor_rewardPaid_nonnegative" CHECK ("rewardPaid" >= 0);
