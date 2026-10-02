-- Een groco die zelf bij Theokot bestelt (bv. het broodje van de week, dat niet
-- in het aanbod van de grocomeet staat), krijgt die broodjes in de doos van de
-- GM: ze staan in de GM-kolom van de turflijst, worden bij de grocomeet
-- afgerekend en tellen na de afhaal als opgehaald in plaats van als no-show.
--
-- Bestaande bestellingen krijgen `grocomeetId = NULL` en blijven dus gewone
-- bestellingen, af te halen en te betalen aan de balie. Een nog openstaande
-- bestelling van een groco op een GM-dag schuift pas in de doos wanneer de
-- koppeling opnieuw loopt: bij aanpassen, of wanneer het aanbod van die dag of
-- de vergadering zelf opgeslagen wordt. Wat al afgehaald of als no-show
-- geboekt is, verandert niet.
ALTER TABLE "TheokotOrder" ADD COLUMN     "grocomeetId" TEXT,
ADD COLUMN     "grocomeetPaidAt" TIMESTAMPTZ(3);

CREATE INDEX "TheokotOrder_grocomeetId_idx" ON "TheokotOrder"("grocomeetId");

ALTER TABLE "TheokotOrder" ADD CONSTRAINT "TheokotOrder_grocomeetId_fkey" FOREIGN KEY ("grocomeetId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
