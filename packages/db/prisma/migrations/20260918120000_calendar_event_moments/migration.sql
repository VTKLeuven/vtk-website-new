-- Momenten van een evenement: een loopweek met elke dag een loopje is één
-- evenement met zeven momenten, geen zeven evenementen en geen blok dat een week
-- lang doorloopt. `CalendarEvent.start`/`.end` blijven de envelop eromheen.

-- CreateTable
CREATE TABLE "CalendarEventMoment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "start" TIMESTAMPTZ(3) NOT NULL,
    "end" TIMESTAMPTZ(3) NOT NULL,
    "label" TEXT,

    CONSTRAINT "CalendarEventMoment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventMoment_eventId_start_idx" ON "CalendarEventMoment"("eventId", "start");

-- CreateIndex
CREATE INDEX "CalendarEventMoment_start_idx" ON "CalendarEventMoment"("start");

-- AddForeignKey
ALTER TABLE "CalendarEventMoment" ADD CONSTRAINT "CalendarEventMoment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
