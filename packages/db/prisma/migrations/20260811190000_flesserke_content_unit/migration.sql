-- De eenheid bij de hoeveelheid. De import las de Excel-kolom
-- "Hoeveelheid [kg of L]" en bewaarde enkel het getal, dus "0.14" kon zowel
-- 140 g als 140 ml zijn; de eenheid zat hoogstens in de naam ("tomatenpuree 140g").
--
-- Enkel de kolom. Het invullen ervan gebeurt met
-- `apps/logistiek/scripts/flesserke-units.ts`, dat eerst een dry-run toont: de
-- juiste eenheid is een keuze per item en geen regel die je in SQL wil gieten.
ALTER TABLE "UitleenFlesserkeItem" ADD COLUMN "contentUnit" TEXT;
