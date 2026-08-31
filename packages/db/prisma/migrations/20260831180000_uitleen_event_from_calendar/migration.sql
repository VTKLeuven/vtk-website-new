-- Een logistiek-evenement dat uit een kalenderevenement op vtk.be ontstaat (E1).
--
-- Nullable en uniek: de meeste logistiek-evenementen ontstaan in de app zelf, en
-- eentje dat van de site komt hoort er precies één te hebben. `SetNull` bij het
-- verwijderen van het kalenderevenement: de aanvragen eronder zijn het echte werk
-- en blijven bestaan.
ALTER TABLE "UitleenEvent" ADD COLUMN "calendarEventId" TEXT;

CREATE UNIQUE INDEX "UitleenEvent_calendarEventId_key" ON "UitleenEvent"("calendarEventId");

ALTER TABLE "UitleenEvent"
  ADD CONSTRAINT "UitleenEvent_calendarEventId_fkey"
  FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
