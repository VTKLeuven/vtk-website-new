-- De permissie zelf: aankondigingen krijgen hun eigen recht in plaats van onder
-- `home.edit` te vallen. Zonder deze rij bestaat `announcements.manage` nergens
-- en is ze ook niet toe te kennen in /admin/roles.
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-announcements-manage',
  'announcements.manage',
  'Aankondigingen beheren',
  'Manage announcements',
  'general'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

-- Aan admin, en aan elke rol die reeds `home.edit` had (zodat bestaande
-- beheerders van aankondigingen hun toegang niet verliezen).
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."code" = 'admin'
  AND permission."code" = 'announcements.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT old_grant."roleId", new_perm."id"
FROM "RolePermission" AS old_grant
JOIN "Permission" AS old_perm
  ON old_perm."id" = old_grant."permissionId"
  AND old_perm."code" = 'home.edit'
CROSS JOIN "Permission" AS new_perm
WHERE new_perm."code" = 'announcements.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
