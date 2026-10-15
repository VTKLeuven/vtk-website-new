-- Bestuursorgaan: een budget kan bij meer dan één post horen, en een post is
-- niet altijd een `Group` (de rollen van Groep 5, Jaarwerkingen, Overige; zie
-- lib/bo/posts.ts).
--
-- BoPostAlias: één of meer postsleutels in plaats van één groep. Een
-- bestaande koppeling behoudt haar post (`g:<groupId>`). Een koppeling voor een
-- schrijfwijze die de site nu zelf kent ("Vice", "Secretaris", "Halftime"),
-- valt weg: anders bleef "Vice" bij Groep 5 hangen in plaats van bij de
-- Vice-praeses, en dat is net wat deze wijziging rechtzet.
ALTER TABLE "BoPostAlias" ADD COLUMN "postKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "BoPostAlias" SET "postKeys" = ARRAY['g:' || "groupId"];
DELETE FROM "BoPostAlias"
WHERE "key" IN (
  'praeses', 'preses', 'vice', 'vicepraeses', 'vicepreses', 'vp',
  'secretaris', 'secretariaat', 'secr', 'beheer', 'penning', 'penningmeester',
  'jaarwerkingen', 'jaarwerking', 'halftime', 'studentenwelkom',
  'overige', 'overig', 'varia'
);
ALTER TABLE "BoPostAlias" DROP CONSTRAINT "BoPostAlias_groupId_fkey";
DROP INDEX "BoPostAlias_groupId_idx";
ALTER TABLE "BoPostAlias" DROP COLUMN "groupId";

-- BoDocument: posten met de hand per bestand, en een resultaat zonder budget
-- op het BO (versneld goedgekeurd door de grocomeet, of geen budget nodig).
-- Bestaande rijen: geen keuze (uit de naam) en geen uitzondering, dus ze
-- tonen precies wat ze toonden.
ALTER TABLE "BoDocument" ADD COLUMN "budgetWaiver" TEXT,
ADD COLUMN "postKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
