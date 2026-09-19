-- Interesse per moment van een evenement met losse momenten (een loopweek met
-- elke dag een loopje). Het startinstant en niet de moment-id: de bewaaractie
-- van een evenement maakt alle momenten opnieuw aan, dus elke id verandert bij
-- de eerstvolgende bewaring. Zie het commentaar bij CalendarEventInterest.

-- AlterTable
ALTER TABLE "CalendarEventInterest" ADD COLUMN "momentStart" TIMESTAMPTZ(3);

-- DropIndex
DROP INDEX "CalendarEventInterest_userId_eventId_key";

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventInterest_userId_eventId_momentStart_key" ON "CalendarEventInterest"("userId", "eventId", "momentStart");

-- CreateIndex
CREATE INDEX "CalendarEventInterest_userId_eventId_idx" ON "CalendarEventInterest"("userId", "eventId");
