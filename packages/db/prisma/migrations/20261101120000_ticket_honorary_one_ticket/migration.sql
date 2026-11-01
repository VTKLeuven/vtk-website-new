-- Ereleden: hoogstens één ticket per event, over alle tickettypes heen. Bestaande
-- events en sjablonen krijgen false: daar blijft enkel de grens op de
-- ereledenprijs gelden, zoals voor deze migratie. Er verandert niets aan een
-- lopende verkoop tot iemand het vinkje zet.
ALTER TABLE "TicketEvent" ADD COLUMN "honoraryOneTicket" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketEventTemplate" ADD COLUMN "honoraryOneTicket" BOOLEAN NOT NULL DEFAULT false;
