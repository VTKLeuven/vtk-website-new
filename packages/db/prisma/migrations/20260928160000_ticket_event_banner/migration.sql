-- Een eigen banner voor een ticketevent: een foto met zijn uitsnede, of de
-- standaardbanner van een kalenderthema. Tot nu kwam de banner enkel van het
-- gekoppelde kalenderevent, dus een ticketevent zonder koppeling had er geen.
--
-- Bestaande ticketevents krijgen NULL (en het midden als uitsnede), en dat is
-- voor hen juist: zonder eigen keuze blijft de foto van het kalenderevent
-- staan, zoals voorheen.
ALTER TABLE "TicketEvent" ADD COLUMN "imageKey" TEXT;
ALTER TABLE "TicketEvent" ADD COLUMN "imageFocusX" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "TicketEvent" ADD COLUMN "imageFocusY" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "TicketEvent" ADD COLUMN "imageCategoryId" TEXT;

ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_imageCategoryId_fkey"
  FOREIGN KEY ("imageCategoryId") REFERENCES "CalendarCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
