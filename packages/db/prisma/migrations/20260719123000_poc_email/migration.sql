-- Eén mailadres per POC (bv. wtk-poc@vtk.be) in plaats van het persoonlijke
-- adres van elke vertegenwoordiger. De description-kolommen blijven staan: ze
-- worden nergens meer getoond, maar weggooien zou bestaande tekst vernietigen.
ALTER TABLE "Poc" ADD COLUMN "email" TEXT;
