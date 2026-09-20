-- `Shift` had geen `updatedAt`. De persoonlijke agendafeed gebruikte daarom
-- `startTime` om `LAST-MODIFIED` en `SEQUENCE` mee te vullen, en dat is het
-- verkeerde getal: het zegt wanneer de shift doorgaat, niet wanneer we er iets
-- aan veranderden. Een shift hernoemen of verplaatsen bewoog `SEQUENCE` dus
-- niet, en een agenda-client die daarop let, bleef de oude versie tonen.
ALTER TABLE "Shift" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Bestaande shiften krijgen het moment van deze migratie, en dat is een
-- bewuste keuze met één zichtbaar gevolg.
--
-- Voor een shift die nog moet doorgaan, lag `startTime` in de toekomst en was
-- de oude `SEQUENCE` dus hoger dan wat ze vanaf nu krijgt. Die ene keer daalt
-- het getal. Dat mag hier: deze feeds zijn abonnementen (`METHOD:PUBLISH`), en
-- een client haalt het hele bestand opnieuw op in plaats van per afspraak op
-- `SEQUENCE` te vergelijken; dat veld is er een hint, geen sleutel.
--
-- Het alternatief was `GREATEST("startTime", CURRENT_TIMESTAMP)`, zodat er
-- nooit iets daalt. Dat is precies verkeerd: een toekomstige shift houdt dan
-- blijvend een `SEQUENCE` die geen enkele latere wijziging nog kan overtreffen,
-- en dan blijft de bug bestaan die deze kolom komt oplossen.
