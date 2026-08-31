-- Vaste routes en externe links krijgen dezelfde kaartfoto op een
-- categoriepagina als gewone CMS-pagina's.
ALTER TABLE "HeaderTabLink" ADD COLUMN "imageKey" TEXT;
