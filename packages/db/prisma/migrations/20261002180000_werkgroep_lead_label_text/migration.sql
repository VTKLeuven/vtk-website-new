-- De titel van de verantwoordelijke van een werkgroep wordt vrije tekst in
-- plaats van de keuze G3 of G4. Bestaande werkgroepen houden hun waarde: 'G3'
-- en 'G4' blijven gewoon als tekst staan, er verandert op het scherm niets.

ALTER TABLE "Group" ALTER COLUMN "leadLabel" DROP DEFAULT;
ALTER TABLE "Group" ALTER COLUMN "leadLabel" TYPE TEXT USING "leadLabel"::TEXT;
ALTER TABLE "Group" ALTER COLUMN "leadLabel" SET DEFAULT 'G3';

DROP TYPE "GroupLeadLabel";
