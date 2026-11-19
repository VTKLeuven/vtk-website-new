-- POC-peilingen, deel twee: concepten, fases, Discord en de samenvatting.
--
-- Een bestaande peiling is geen concept: die staat al open, dus `publishedAt` krijgt
-- haar startmoment. Alle andere nieuwe kolommen zijn leeg of hebben een default die
-- ook voor bestaande rijen klopt (geen fases = de hele richting).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discordId" TEXT,
ADD COLUMN     "discordUsername" TEXT;

-- AlterTable
ALTER TABLE "PocPoll" ADD COLUMN     "discordChannelId" TEXT,
ADD COLUMN     "discordClosedAt" TIMESTAMPTZ(3),
ADD COLUMN     "discordError" TEXT,
ADD COLUMN     "discordMessageId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "studyYears" "StudyYear"[] DEFAULT ARRAY[]::"StudyYear"[],
ADD COLUMN     "summaryNl" TEXT,
ADD COLUMN     "summaryPublishedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PocPollAnswer" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "studyYears" "StudyYear"[] DEFAULT ARRAY[]::"StudyYear"[];

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");


-- Backfill
UPDATE "PocPoll" SET "publishedAt" = "opensAt" WHERE "publishedAt" IS NULL;
