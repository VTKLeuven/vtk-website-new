-- De infotekst en website van een werkgroep (/werkgroepen) krijgen een eigen
-- recht. Tot nu mocht elk lid van de werkgroep ze aanpassen, zonder recht; nu
-- enkel wie `werkgroepen.editOwnInfo` via die werkgroep krijgt.
--
-- Bestaande rijen: wie vandaag de leden van een werkgroep beheert
-- (`werkgroepen.manageOwnMembers`, in productie de rol `werkgroepen-g3-g4` op de
-- LEADER-grant) krijgt het recht erbij, zodat de G3/G4 de tekst na de deploy
-- nog kan aanpassen. Een gewoon lid verliest het; dat is de bedoeling.
--
-- De Permission-rij staat hier zelf, want de config-sync draait pas na
-- `migrate deploy`; zonder de rij kon de koppeling hieronder niet.
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-werkgroepen-edit-own-info',
  'werkgroepen.editOwnInfo',
  'Infotekst en website van de eigen werkgroep aanpassen',
  'Edit info text and website of own werkgroep',
  'users'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

-- Aan admin (de sync zou het ook doen, maar dan pas bij de start).
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."code" = 'admin'
  AND permission."code" = 'werkgroepen.editOwnInfo'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Aan elke rol die de leden van de eigen werkgroep beheert.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT old_grant."roleId", new_perm."id"
FROM "RolePermission" AS old_grant
JOIN "Permission" AS old_perm
  ON old_perm."id" = old_grant."permissionId"
  AND old_perm."code" = 'werkgroepen.manageOwnMembers'
CROSS JOIN "Permission" AS new_perm
WHERE new_perm."code" = 'werkgroepen.editOwnInfo'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
