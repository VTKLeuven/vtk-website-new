-- Eén centrale openingsurenpagina, zichtbaar voor de drie posten die er hun
-- eigen kaart beheren. De server blijft daarnaast de exacte post controleren.
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-opening-hours-manage-own',
  'openingHours.manageOwn',
  'Openingsuren van eigen post beheren',
  'Manage own post''s opening hours',
  'general'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."code" IN ('admin', 'post-cursusdienst', 'post-fakbar', 'post-theokot')
  AND permission."code" = 'openingHours.manageOwn'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- De oude Cursusdienst-week was een handmatig sjabloon en mag niet als
-- terugval getoond worden. Concrete uren komen uitsluitend uit Cudi.
UPDATE "Setting"
SET "value" = "value" - 'entries'
WHERE "key" = 'home.openingHours.cursusdienst';

-- 't ElixIr krijgt een expliciet rooster. Zonder deze instelling behandelt de
-- applicatie alle dagen als gesloten; er is dus geen verborgen code-default.
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES (
  'home.openingHours.elixir',
  '{"titleNl":"''t ElixIr","titleEn":"''t ElixIr","subtitleNl":"Faculteitsbar Ingenieurswetenschappen","subtitleEn":"Faculty Bar Engineering Science","noteNl":"Het sluitingsuur varieert per avond.","noteEn":"The closing time varies from night to night.","entries":[{"dayNl":"Zondag","dayEn":"Sunday","hours":"22:00"},{"dayNl":"Maandag","dayEn":"Monday","hours":"22:00"},{"dayNl":"Dinsdag","dayEn":"Tuesday","hours":"22:00"},{"dayNl":"Woensdag","dayEn":"Wednesday","hours":"22:00"},{"dayNl":"Donderdag","dayEn":"Thursday","hours":"22:00"}]}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
