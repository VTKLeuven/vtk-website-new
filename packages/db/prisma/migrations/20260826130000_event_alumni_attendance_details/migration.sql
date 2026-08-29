-- Alumni-informatie hoort bij de keuze voor één evenement, niet bij het profiel.
ALTER TABLE "CalendarEventInterest"
ADD COLUMN "displayName" TEXT,
ADD COLUMN "graduationYear" INTEGER,
ADD COLUMN "wasInVtk" BOOLEAN NOT NULL DEFAULT false;

-- Bewaar de informatie die bestaande leden al zichtbaar hadden gezet, maar maak
-- er vanaf nu een momentopname per evenement van.
UPDATE "CalendarEventInterest" AS interest
SET
  "displayName" = CASE WHEN interest."showName" THEN member."name" ELSE NULL END,
  "graduationYear" = CASE
    WHEN interest."showGraduationYear" THEN member."graduationYear"
    ELSE NULL
  END,
  "wasInVtk" = CASE WHEN interest."showWasInVtk" THEN member."wasInVtk" ELSE false END
FROM "User" AS member
WHERE member."id" = interest."userId";

ALTER TABLE "CalendarEventGuestInterest"
ADD COLUMN "showName" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showGraduationYear" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showWasInVtk" BOOLEAN NOT NULL DEFAULT false;

-- Gastgegevens waren vroeger automatisch zichtbaar. Behoud die keuze voor
-- bestaande rijen; nieuwe rijen starten volledig privé.
UPDATE "CalendarEventGuestInterest"
SET
  "showName" = "displayName" IS NOT NULL,
  "showGraduationYear" = "graduationYear" IS NOT NULL,
  "showWasInVtk" = "wasInVtk";
