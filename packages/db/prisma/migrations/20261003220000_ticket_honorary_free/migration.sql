-- Ereleden gratis: per tickettype aan te zetten, standaard uit. Bestaande types
-- en sjablonen blijven uit; er verandert niets tot iemand het vinkje zet.
ALTER TABLE "TicketType" ADD COLUMN "honoraryFree" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketEventTemplateType" ADD COLUMN "honoraryFree" BOOLEAN NOT NULL DEFAULT false;

-- Welke bestelregel het gratis erelidticket is. Voor bestaande regels nooit:
-- de optie bestond niet, dus niemand heeft er al een gebruikt.
ALTER TABLE "TicketOrderItem" ADD COLUMN "honoraryFree" BOOLEAN NOT NULL DEFAULT false;
