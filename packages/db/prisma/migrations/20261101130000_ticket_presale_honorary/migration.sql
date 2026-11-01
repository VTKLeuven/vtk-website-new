-- Ereleden in de voorverkoop. Ereleden horen van oudsher bij de voorinschrijving
-- (de oude site deed dat), en de nieuwe site had ze daar niet meer bij. Daarom
-- staat het ook voor bestaande events en sjablonen aan: dat is het herstel dat
-- gevraagd werd. Op een event zonder voorverkoop verandert er niets; wie ze er
-- bij een event niet bij wil, vinkt het uit bij de voorverkoop.
ALTER TABLE "TicketEvent" ADD COLUMN "presaleHonorary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TicketEventTemplate" ADD COLUMN "presaleHonorary" BOOLEAN NOT NULL DEFAULT true;
