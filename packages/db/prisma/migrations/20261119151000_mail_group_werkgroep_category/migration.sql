-- Een lijst die een werkgroep zelf aanmaakte (mechanix.g4@vtk.be), kwam zonder
-- categorie in het overzicht. Vanaf nu krijgt ze bij het aanmaken de categorie
-- van haar werkgroep; deze update doet hetzelfde voor de lijsten van voor die
-- wijziging. Enkel lijsten zonder categorie: een gekozen categorie blijft.
-- Een subcategorie (Werkgroepen › Mechanix) wint, bij twee de oudste, zoals
-- `werkgroepCategoryId` in apps/web/lib/google/werkgroepCategory.ts.
UPDATE "MailGroup" mg
SET "categoryId" = (
  SELECT c."id"
  FROM "MailGroupCategory" c
  WHERE c."ownerGroupId" = mg."ownerGroupId"
  ORDER BY (c."parentId" IS NULL), c."createdAt"
  LIMIT 1
)
WHERE mg."categoryId" IS NULL
  AND mg."ownerGroupId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "MailGroupCategory" c WHERE c."ownerGroupId" = mg."ownerGroupId");
