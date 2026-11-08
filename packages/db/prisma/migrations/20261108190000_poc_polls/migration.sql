-- POC-peilingen: de RiVers vragen de studenten van hun richting om hun mening.
-- Drie nieuwe tabellen, dus geen bestaande rijen om over te beslissen. Zolang er
-- geen peiling in staat, verandert er op de site niets.
--
-- PocPollAnswer heeft bewust geen eigen id, geen userId en geen tijdstempels: een
-- antwoord mag niet terug te leiden zijn tot een persoon. Zie schema.prisma.

-- CreateEnum
CREATE TYPE "PocPollQuestionKind" AS ENUM ('YES_NO', 'SCORE', 'OPEN');

-- CreateTable
CREATE TABLE "PocPoll" (
    "id" TEXT NOT NULL,
    "pocId" TEXT NOT NULL,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "meetingDate" DATE,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PocPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocPollQuestion" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "kind" "PocPollQuestionKind" NOT NULL,
    "textNl" TEXT NOT NULL,
    "textEn" TEXT,
    "lowLabelNl" TEXT,
    "lowLabelEn" TEXT,
    "highLabelNl" TEXT,
    "highLabelEn" TEXT,

    CONSTRAINT "PocPollQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocPollAnswer" (
    "questionId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "value" INTEGER,
    "text" TEXT,

    CONSTRAINT "PocPollAnswer_pkey" PRIMARY KEY ("questionId","voterKey")
);

-- CreateIndex
CREATE INDEX "PocPoll_pocId_idx" ON "PocPoll"("pocId");

-- CreateIndex
CREATE INDEX "PocPoll_closesAt_idx" ON "PocPoll"("closesAt");

-- CreateIndex
CREATE INDEX "PocPollQuestion_pollId_idx" ON "PocPollQuestion"("pollId");

-- CreateIndex
CREATE INDEX "PocPollAnswer_voterKey_idx" ON "PocPollAnswer"("voterKey");

-- AddForeignKey
ALTER TABLE "PocPoll" ADD CONSTRAINT "PocPoll_pocId_fkey" FOREIGN KEY ("pocId") REFERENCES "Poc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocPollQuestion" ADD CONSTRAINT "PocPollQuestion_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "PocPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocPollAnswer" ADD CONSTRAINT "PocPollAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PocPollQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
