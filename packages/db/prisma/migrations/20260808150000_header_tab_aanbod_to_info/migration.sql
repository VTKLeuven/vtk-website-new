-- De hernoeming van de tab "Aanbod" naar "Info" (slug /aanbod -> /info) zit al in
-- de seed-defaults (packages/db/src/groups.ts), maar ze bereikt een bestaande
-- database nooit: prisma/seed.ts doet `headerTab.upsert(... update: {} ...)`, dus
-- een bestaande rij wordt bewust niet bijgewerkt, en er was geen migratie die de
-- slug hernoemde. Gevolg op elke database van voor de hernoeming: de tab staat
-- nog op slug "aanbod" en /info geeft 404, terwijl de footer en de redirects van
-- de oude vtk.be-adressen wel naar /info wijzen.
--
-- Deze migratie zet die ene rij recht. Matchen op `code` en niet op label of
-- slug: de code (AANBOD) is de sleutel die aan de Page-rijen vasthangt, labels en
-- slug zijn admin-beheerd.
--
-- Idempotent: staat de rij al goed, dan raakt de UPDATE niets. Ze wijkt ook uit
-- wanneer een andere tab de slug "info" al bezet houdt, want HeaderTab.slug is
-- uniek en de migratie mag niet halverwege een deploy afbreken.
--
-- De labels gaan enkel mee wanneer ze nog op de oude standaard staan. Een admin
-- die de tab intussen zelf een naam gaf, verliest die niet: het gaat hier om de
-- kapotte URL, niet om het opschrift.
UPDATE "HeaderTab" AS t
SET
  "slug" = 'info',
  "labelNl" = CASE WHEN t."labelNl" = 'Aanbod' THEN 'Info' ELSE t."labelNl" END,
  "labelEn" = CASE WHEN t."labelEn" IN ('Offer', 'Aanbod') THEN 'Info' ELSE t."labelEn" END
WHERE t."code" = 'AANBOD'
  AND (
    t."slug" <> 'info'
    OR t."labelNl" = 'Aanbod'
    OR t."labelEn" IN ('Offer', 'Aanbod')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "HeaderTab" o WHERE o."slug" = 'info' AND o."id" <> t."id"
  );
