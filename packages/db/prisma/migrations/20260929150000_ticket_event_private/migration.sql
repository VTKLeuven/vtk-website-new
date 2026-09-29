-- Een ticketevent kan privé zijn: het staat dan nergens op de site en is enkel
-- te openen en te kopen via een geheime link.
--
-- Bestaande ticketevents krijgen `isPrivate = false` en geen token: ze blijven
-- openbaar, precies zoals ze nu staan, tot iemand in het ticketbeheer
-- "Privé maken" kiest.
ALTER TABLE "TicketEvent" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privateToken" TEXT;

CREATE UNIQUE INDEX "TicketEvent_privateToken_key" ON "TicketEvent"("privateToken");
