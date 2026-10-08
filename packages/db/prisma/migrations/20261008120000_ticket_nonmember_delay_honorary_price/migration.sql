-- Niet-leden pas later: per tickettype een duur na de verkoopstart. Bestaande
-- types en sjablonen krijgen NULL, en dat is "samen met de leden": er verandert
-- niets aan een lopende verkoop tot iemand het instelt.
ALTER TABLE "TicketType" ADD COLUMN "nonMemberDelayMinutes" INTEGER;
ALTER TABLE "TicketEventTemplateType" ADD COLUMN "nonMemberDelayMinutes" INTEGER;

-- De ereledenprijs vervangt het vinkje "Gratis voor ereleden". Wie dat vinkje
-- aan had staan, krijgt een ereledenprijs van 0: hetzelfde gratis ticket, met
-- dezelfde grens van één per erelid. De rest krijgt NULL, geen ereledenprijs,
-- zoals het vinkje uit stond.
ALTER TABLE "TicketType" ADD COLUMN "honoraryPriceCents" INTEGER;
UPDATE "TicketType" SET "honoraryPriceCents" = 0 WHERE "honoraryFree";
ALTER TABLE "TicketType" DROP COLUMN "honoraryFree";

ALTER TABLE "TicketEventTemplateType" ADD COLUMN "honoraryPriceCents" INTEGER;
UPDATE "TicketEventTemplateType" SET "honoraryPriceCents" = 0 WHERE "honoraryFree";
ALTER TABLE "TicketEventTemplateType" DROP COLUMN "honoraryFree";

-- Een bestelregel die het gratis erelidticket was, is nu het erelidticket aan
-- de ereledenprijs (toen 0). Hernoemd en niet opnieuw aangemaakt, zodat de
-- telling "één per erelid per event" de al uitgegeven tickets blijft zien.
ALTER TABLE "TicketOrderItem" RENAME COLUMN "honoraryFree" TO "honoraryPrice";
