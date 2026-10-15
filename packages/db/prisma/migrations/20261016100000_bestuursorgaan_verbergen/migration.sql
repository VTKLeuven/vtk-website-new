-- "Niet meetellen" op /admin/bestuursorgaan: Groep 5 haalt een bestand uit het
-- overzicht (een oude versie, een kopie) zonder iets in Drive te wijzigen.
-- Bestaande rijen: NULL, dus ze tellen mee zoals voorheen.
ALTER TABLE "BoDocument" ADD COLUMN "hiddenAt" TIMESTAMPTZ(3);
