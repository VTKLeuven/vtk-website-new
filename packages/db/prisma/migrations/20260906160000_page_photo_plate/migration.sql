-- De foto van een contentpagina wordt een plaat boven de tekst.
--
-- Ze lag tot nu onder de donkere paginakop, onder een waas die aan de titelkant
-- op 94% staat en pas rechts opklaart, in een band van zo'n 260 pixels hoog. De
-- foto was er wel, maar er viel niets van te zien. Boven de tekst staat ze
-- onbewerkt, en dat vraagt twee dingen die de kop niet vroeg.
--
-- Een bijschrift, want een foto zonder woorden boven een artikel is decoratie
-- en met een regel erbij inhoud. Leeg blijft geldig; dan staat er enkel de foto.
--
-- En een uitsnedepunt, want de plaat is 2,45:1 en dat is een veel hardere snee
-- dan de band was. Het midden is de standaard, precies wat de browser vandaag
-- al doet, dus bestaande pagina's veranderen niet tot iemand het punt verlegt.

ALTER TABLE "Page"
  ADD COLUMN "imageCaptionNl" TEXT,
  ADD COLUMN "imageCaptionEn" TEXT,
  ADD COLUMN "imageFocusX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "imageFocusY" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
