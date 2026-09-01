-- De permissie zelf, want de seed draait niet mee met een deploy: zonder deze
-- rij bestaat `calendar.heroWeek` nergens en is ze ook niet toe te kennen in
-- /admin/roles. Zelfde aanpak als 20260823170000_opening_hours_admin.
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-calendar-hero-week',
  'calendar.heroWeek',
  'Evenementen uitlichten of weglaten in het weekoverzicht',
  'Highlight or hide events in the week overview',
  'calendar'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

-- Enkel aan admin. Wie het weekoverzicht op de homepage samenstelt, is niet
-- vanzelf wie evenementen beheert; die toekenning gebeurt bewust met de hand in
-- /admin/roles.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."code" = 'admin'
  AND permission."code" = 'calendar.heroWeek'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
