-- Big bureau: bij een bureau met veel meer volk levert Theokot enkel de eerste
-- zoveel broodjes (in volgorde van inschrijven); de rest wordt bewaard en apart
-- bij een externe zaak besteld. Zie docs/design-decisions.md.
--
-- Bestaande bureaus krijgen `theokotLimit = NULL` en blijven dus gewone bureaus:
-- alles van Theokot, zoals ze tot nu waren. Elke bestaande reservatie krijgt
-- `external = false`, want vóór deze migratie kwam elk broodje van Theokot (of
-- uit het eigen aanbod). Er verschuift niets tot iemand big bureau aanzet.
ALTER TABLE "Meeting" ADD COLUMN     "theokotLimit" INTEGER;

ALTER TABLE "MeetingReservation" ADD COLUMN     "external" BOOLEAN NOT NULL DEFAULT false;
