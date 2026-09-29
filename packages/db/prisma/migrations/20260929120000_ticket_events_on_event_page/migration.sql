-- Een kalenderevent kan meerdere ticketpagina's hebben, en die kunnen op de
-- eventpagina zelf staan in plaats van op een eigen pagina.
--
-- Bestaande ticketevents krijgen `onEventPage = false`, `ownTimes = false` en
-- geen label: er verandert niets aan wat bezoekers zien tot iemand in het
-- ticketbeheer "Op de eventpagina" aanzet. Een gekoppelde verkoop bleef tot nu
-- toe altijd de uren van het kalenderevent volgen, en dat blijft zo.
DROP INDEX "TicketEvent_calendarEventId_key";

ALTER TABLE "TicketEvent" ADD COLUMN     "labelEn" TEXT,
ADD COLUMN     "labelNl" TEXT,
ADD COLUMN     "onEventPage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownTimes" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TicketEvent_calendarEventId_idx" ON "TicketEvent"("calendarEventId");
