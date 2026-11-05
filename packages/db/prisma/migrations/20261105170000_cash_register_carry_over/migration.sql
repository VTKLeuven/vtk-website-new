-- De kassa waarvan de eindkassa als startkassa doorgeschoven werd. Bestaande
-- kassa's krijgen NULL: doorschuiven kon tot nu enkel in het rekenblad, en welke
-- kassa daar van welke kwam, is niet te kennen.
ALTER TABLE "CashRegister" ADD COLUMN "startFromId" TEXT;

CREATE UNIQUE INDEX "CashRegister_startFromId_key" ON "CashRegister"("startFromId");

ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_startFromId_fkey" FOREIGN KEY ("startFromId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
