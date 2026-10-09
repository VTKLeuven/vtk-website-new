-- Bureauvoorraad: Theokot maakt voor elk bureau een aantal broodjes bovenop het
-- aanbod van die dag (setting `theokot.bureauStock`). Zijn de broodjes voor
-- studenten op, dan kan het bureau er nog uit deze voorraad krijgen. Zie
-- docs/design-decisions.md.
--
-- Elke bestaande reservatie krijgt `extra = false`, want vóór deze migratie kwam
-- elk broodje uit de gewone voorraad (of extern, of uit het eigen aanbod). Er
-- verandert niets tot Theokot een bureauvoorraad invult.
ALTER TABLE "MeetingReservation" ADD COLUMN     "extra" BOOLEAN NOT NULL DEFAULT false;
