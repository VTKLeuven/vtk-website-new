-- Eén vrije nota bij de beschikbaarheid van één chauffeur voor één week (F4.5).
--
-- Er bestond al een nota per venster (`UitleenDriverAvailability.note`), maar
-- Logistiek vroeg om er één "in het algemeen, ni per individueel stukje". Wat
-- iemand over een hele week te zeggen heeft ("die week examens", "bel me liever
-- dan te mailen"), hoort niet bij één uurvak; wie het daar toch moest zetten,
-- koos er willekeurig één uit of schreef het nergens op.
--
-- Een nieuwe tabel, dus nul rijen voor wat er al staat. Dat klopt hier: een
-- nota die niemand geschreven heeft, bestaat niet, en de bestaande nota's per
-- venster blijven onaangeroerd staan waar ze staan. Er valt dus niets te
-- backfillen, en dit raakt geen enkele rit.
CREATE TABLE "UitleenDriverAvailabilityNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- Een datum en geen tijdstip: het is een week en geen moment, en met een
    -- tijdstip zou dezelfde week na een zomeruurwissel twee sleutels krijgen.
    "weekStart" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenDriverAvailabilityNote_pkey" PRIMARY KEY ("id")
);

-- Eén nota per chauffeur per week: het scherm toont één veld, en een tweede rij
-- zou stil de ene of de andere tekst laten winnen.
CREATE UNIQUE INDEX "UitleenDriverAvailabilityNote_userId_weekStart_key" ON "UitleenDriverAvailabilityNote"("userId", "weekStart");

-- De planning haalt de nota's van één week op voor alle chauffeurs tegelijk.
CREATE INDEX "UitleenDriverAvailabilityNote_weekStart_idx" ON "UitleenDriverAvailabilityNote"("weekStart");

ALTER TABLE "UitleenDriverAvailabilityNote" ADD CONSTRAINT "UitleenDriverAvailabilityNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
