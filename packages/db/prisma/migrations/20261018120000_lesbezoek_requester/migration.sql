-- "Jouw aanvragen" op /lesbezoeken: het account waarmee een lesbezoek
-- aangevraagd werd, wanneer de aanvrager ingelogd was.
-- Bestaande rijen: NULL. Het formulier vroeg geen login, dus welk account achter
-- een oude aanvraag zat, weten we niet. Het overzicht vindt die aanvragen via
-- het e-mailadres van de aanvrager wanneer dat het adres van het account is;
-- daarom geen backfill.
ALTER TABLE "Lesbezoek" ADD COLUMN "requesterId" TEXT;

CREATE INDEX "Lesbezoek_requesterId_idx" ON "Lesbezoek"("requesterId");

ALTER TABLE "Lesbezoek" ADD CONSTRAINT "Lesbezoek_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
