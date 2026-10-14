-- Of gekoppelde computers van een e-mailadres op de 24UL-downloadlijst de live
-- tussenstand naar vtk.be mogen sturen.
ALTER TABLE "UrenloopDownloadEmail"
ADD COLUMN "canPublishStats" BOOLEAN NOT NULL DEFAULT false;

-- Het recht waarmee Sport de uren en het resultatenvenster van de 24 urenloop
-- instelt (/admin/24urenloop).
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-urenloop-manage',
  'urenloop.manage',
  '24 urenloop beheren (start, aankomst en resultaten)',
  'Manage the 24-hour run (start, finish and results)',
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
WHERE role."code" = 'admin'
  AND permission."code" = 'urenloop.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
