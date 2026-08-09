-- Een knop naast de titel van een pagina, met dezelfde drie velden als HeaderTab
-- al heeft. Een pagina die een aparte app beschrijft (Uitleendienst, Shiften)
-- moest die app tot nu toe ergens in de lopende tekst linken; nu staat ze op
-- dezelfde plek als "Bestel cursussen op cudi.vtk.be" bij Cursusdienst.
ALTER TABLE "Page" ADD COLUMN "ctaLabelNl" TEXT;
ALTER TABLE "Page" ADD COLUMN "ctaLabelEn" TEXT;
ALTER TABLE "Page" ADD COLUMN "ctaUrl" TEXT;
