-- Shiften die van cudi.vtk.be gespiegeld zijn, kregen als post de naam
-- "Cursusdienst" in plaats van de groepscode "CURSUSDIENST". Op /shift stonden ze
-- daardoor onder een tweede post met dezelfde naam, en in de ranking telden ze
-- apart van de cursusdienstshiften die hier zelf aangemaakt worden.
--
-- Toekomstige shiften zet de volgende sync van cudi vanzelf recht (de upsert
-- schrijft `post` opnieuw). Voorbije gespiegelde shiften stuurt cudi niet meer,
-- dus die zetten we hier om, zodat ranking en geschiedenis ze bij de juiste post
-- tellen. Enkel gespiegelde shiften met precies die naam; al de rest blijft.
UPDATE "Shift"
SET "post" = 'CURSUSDIENST'
WHERE "sourceSystem" = 'cudi'
  AND "post" = 'Cursusdienst';
