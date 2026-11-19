-- Groep 5 duidt een budget aan als potje (deelbudget): materiaal of
-- voorzieningen die door het jaar gekocht worden. Een potje wacht niet op een
-- resultaat en telt in de stand tegenover de begroting voor het begrote bedrag.
-- Bestaande bestanden: NULL, dus geen potje. Dat klopt: tot nu toe kon niemand
-- iets als potje aanduiden, en wat "Deelbudget" heet, herkent de site aan de naam.
ALTER TABLE "BoDocument" ADD COLUMN "potAt" TIMESTAMPTZ(3);
