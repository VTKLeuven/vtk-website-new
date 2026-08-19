-- Het bestaande dashboard.manage wordt het recht voor globale tegels. Maak het
-- nieuwe eigen-postrecht alvast aan vóór de config-sync en geef het eenmalig aan
-- elke rol die het vroegere, gecombineerde recht had. Daarna kunnen beide
-- rechten onafhankelijk beheerd worden.
UPDATE "Permission"
SET
  "labelNl" = 'Voor iedereen tegels beheren',
  "labelEn" = 'Manage tiles for everyone',
  "category" = 'general'
WHERE "code" = 'dashboard.manage';

INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-dashboard-manage-own',
  'dashboard.manageOwn',
  'Tegels van eigen post beheren',
  'Manage own post''s tiles',
  'general'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT old_grant."roleId", own_permission."id"
FROM "RolePermission" AS old_grant
JOIN "Permission" AS global_permission
  ON global_permission."id" = old_grant."permissionId"
  AND global_permission."code" = 'dashboard.manage'
CROSS JOIN "Permission" AS own_permission
WHERE own_permission."code" = 'dashboard.manageOwn'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
