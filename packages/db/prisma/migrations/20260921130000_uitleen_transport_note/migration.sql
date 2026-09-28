-- Eigen nota's bij een rit, met een zichtbaarheid per nota (F4.20).
--
-- Logistiek vroeg om "eigen nota toevoegen aan komende ritten en aan ritten van
-- mijn post", met de keuze tussen enkel voor jezelf, voor de post en voor de
-- post plus Logistiek. Dat is iets anders dan de twee notavelden die al op een
-- rit staan: `memberNote` is wat de aanvrager bij het aanvragen schreef en
-- `adminNote` is de boodschap van Logistiek die meegaat in de mail. Die twee
-- horen bij de rit zelf en staan er één keer op; dit zijn de notities van de
-- mensen eromheen, elk met een auteur en een zichtbaarheid, en er kunnen er
-- meer dan één zijn.
--
-- Wat bestaande ritten krijgen: **nul rijen, en de twee oude velden blijven
-- staan waar ze staan.** Uitdrukkelijk zo beslist en niet de weg van de minste
-- weerstand: `memberNote` of `adminNote` hierheen kopiëren was de andere optie,
-- en die is afgewezen. `adminNote` hangt aan de mail naar de aanvrager (die
-- logica leest de kolom, niet deze tabel), en een tekst die op twee plaatsen
-- tegelijk staat, loopt bij de eerste wijziging uiteen. Een rit van vorig jaar
-- toont dus gewoon geen eigen nota's, en dat is correct: niemand heeft er een
-- geschreven.
CREATE TYPE "UitleenTransportNoteVisibility" AS ENUM ('PRIVE', 'POST', 'POST_EN_LOGISTIEK');

CREATE TABLE "UitleenTransportNote" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    -- De standaard is de meest gedeelde van de drie: een nota bij een rit is
    -- meestal iets dat de anderen moeten weten. Het formulier zet de drie keuzes
    -- daarom naast elkaar in beeld, met bij `PRIVE` de zin dat ook Logistiek
    -- niet meeleest, zodat niemand per ongeluk deelt wat hij voor zichzelf
    -- bedoelde.
    "visibility" "UitleenTransportNoteVisibility" NOT NULL DEFAULT 'POST_EN_LOGISTIEK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenTransportNote_pkey" PRIMARY KEY ("id")
);

-- Elk scherm dat een rit toont, haalt er de nota's van op.
CREATE INDEX "UitleenTransportNote_bookingId_idx" ON "UitleenTransportNote"("bookingId");

-- En omgekeerd: wat heb ik zelf geschreven, voor het wissen bij een verwijderd
-- account.
CREATE INDEX "UitleenTransportNote_authorId_idx" ON "UitleenTransportNote"("authorId");

ALTER TABLE "UitleenTransportNote" ADD CONSTRAINT "UitleenTransportNote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "UitleenTransportBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascade en geen SetNull: een nota zonder auteur is niet te plaatsen, en bij
-- `PRIVE` is er dan ook niemand meer die ze mag lezen.
ALTER TABLE "UitleenTransportNote" ADD CONSTRAINT "UitleenTransportNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
