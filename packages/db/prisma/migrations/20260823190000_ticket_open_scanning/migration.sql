-- Standaard staat de scanlijst van een event open: elke praesidiumpost kan
-- scannen, en bij een event van een werkgroep ook die werkgroep zelf. De
-- expliciete grants blijven daarnaast bestaan en kunnen enkel meer geven.
--
-- Bestaande events krijgen `true`, want dat is de gewenste werking; wie een
-- gevoelige gastenlijst heeft, zet ze per event uit.
ALTER TABLE "TicketEvent"
ADD COLUMN "openScanning" BOOLEAN NOT NULL DEFAULT true;
