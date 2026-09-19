-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "heroWeekNoticeAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "CalendarEvent_heroWeekNoticeAt_start_idx" ON "CalendarEvent"("heroWeekNoticeAt", "start");
