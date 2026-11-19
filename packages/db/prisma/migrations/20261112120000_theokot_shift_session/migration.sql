-- Een shift weet voortaan bij welke Theokot-verkoopdag ze hoort. Bestaande
-- shiften krijgen geen koppeling: die zijn met de hand of door een vroegere
-- verkoopweek gezet, en raden welke van een dag zijn, is net wat dit vervangt.
-- SET NULL: een voorbije dag wissen laat de shift en haar bonnetjes staan.
ALTER TABLE "Shift" ADD COLUMN "theokotSessionId" TEXT;

CREATE INDEX "Shift_theokotSessionId_idx" ON "Shift"("theokotSessionId");

ALTER TABLE "Shift" ADD CONSTRAINT "Shift_theokotSessionId_fkey" FOREIGN KEY ("theokotSessionId") REFERENCES "TheokotSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
