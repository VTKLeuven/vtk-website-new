-- Pianoreservaties (lokaal 01.52 in het kasteel). De slots zelf worden berekend
-- uit de vensters min de sluitingsdagen; enkel een geboekt slot krijgt een rij.

CREATE TABLE "PianoWindow" (
    "id" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT,
    "weekdays" INTEGER[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PianoWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PianoWindow_active_idx" ON "PianoWindow"("active");

CREATE TABLE "PianoClosure" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reasonNl" TEXT NOT NULL,
    "reasonEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PianoClosure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PianoClosure_startDate_endDate_idx" ON "PianoClosure"("startDate", "endDate");

CREATE TABLE "PianoReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PianoReservation_pkey" PRIMARY KEY ("id")
);

-- De piano is er maar één: dubbel boeken van hetzelfde slot moet in de database
-- falen, niet enkel in de check vooraf (twee gelijktijdige reservaties).
CREATE UNIQUE INDEX "PianoReservation_startsAt_key" ON "PianoReservation"("startsAt");
CREATE INDEX "PianoReservation_startsAt_idx" ON "PianoReservation"("startsAt");
CREATE INDEX "PianoReservation_userId_startsAt_idx" ON "PianoReservation"("userId", "startsAt");

ALTER TABLE "PianoReservation" ADD CONSTRAINT "PianoReservation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- De avondregeling van het academiejaar staat meteen aan, zodat de pagina niet
-- leeg opstart. Het vakantievenster staat er klaar maar uit: dat geldt enkel
-- tijdens de kerst- en paasvakantie en in juli-augustus, en die periodes hangen
-- af van de academische kalender. De vice zet er de data bij en activeert het.
-- Sluitingsdagen van de KU Leuven geef je apart in via /admin/piano.
INSERT INTO "PianoWindow" ("id", "labelNl", "labelEn", "weekdays", "startMinute", "endMinute", "active", "order", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'Academiejaar (ma, di, do)', 'Academic year (Mon, Tue, Thu)',
     ARRAY[1, 2, 4], 1140, 1320, true, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Vakantie (weekdagen)', 'Holidays (weekdays)',
     ARRAY[1, 2, 3, 4, 5], 540, 1080, false, 1, CURRENT_TIMESTAMP);
