-- Waar de uitsnede van een eventfoto rond draait. De foto zelf blijft
-- ongewijzigd; dit punt gaat als `object-position` mee naar elk formaat op de
-- site, zodat een affiche met tekst bovenaan niet vanzelf halverwege gesneden
-- wordt en de keuze achteraf nog te verleggen is.
--
-- Het midden is de standaard: dat is precies wat de browser vandaag al doet, dus
-- bestaande evenementen veranderen niet van uitzicht tot iemand het punt
-- verlegt.

ALTER TABLE "CalendarEvent"
  ADD COLUMN "imageFocusX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "imageFocusY" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
