-- De Nieuws-band op de homepage (zie apps/web/lib/news en docs/design-decisions.md).
--
-- Enkel wat iemand zelf schrijft, krijgt een tabel: mededelingen en het woordje
-- van de praeses. Ticketverkoop, inschrijvingen, het Bakske, Ir.Reëel en
-- fotoalbums worden bij het lezen afgeleid uit hun bron; `NewsHidden` onthoudt
-- enkel welke daarvan iemand uit het nieuws haalde.

CREATE TYPE "NewsPostKind" AS ENUM ('NOTICE', 'PRAESES');

CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL,
    "kind" "NewsPostKind" NOT NULL DEFAULT 'NOTICE',
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "bodyNl" TEXT NOT NULL,
    "bodyEn" TEXT,
    "ctaLabelNl" TEXT,
    "ctaLabelEn" TEXT,
    "ctaUrl" TEXT,
    "imageKey" TEXT,
    "authorName" TEXT,
    "authorRoleNl" TEXT,
    "authorRoleEn" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsPost_active_publishedAt_idx" ON "NewsPost"("active", "publishedAt");

ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NewsHidden" (
    "source" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsHidden_pkey" PRIMARY KEY ("source", "ref")
);

-- Wat moet hier staan bij evenementen die er al zijn? NULL: niemand heeft ooit
-- aangeduid dat hun link de inschrijvingen opent, dus geen enkel bestaand
-- evenement komt plots in het nieuws. Wie het wil, zet het vinkje in het
-- evenement.
ALTER TABLE "CalendarEvent" ADD COLUMN "registrationNewsAt" TIMESTAMPTZ(3);

-- De permissie. Zonder deze rij bestaat `news.manage` nergens en is ze niet toe
-- te kennen in /admin/roles (de config-sync maakt ze op een deploy ook aan,
-- maar dan pas na deze migratie).
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-news-manage',
  'news.manage',
  'Nieuws op de homepage beheren',
  'Manage homepage news',
  'general'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

-- Aan admin, en aan elke rol die de aankondigingen al beheerde: dat zijn de
-- mensen die vandaag berichten op de homepage zetten.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."code" = 'admin'
  AND permission."code" = 'news.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT old_grant."roleId", new_perm."id"
FROM "RolePermission" AS old_grant
JOIN "Permission" AS old_perm ON old_perm."id" = old_grant."permissionId"
CROSS JOIN "Permission" AS new_perm
WHERE old_perm."code" = 'announcements.manage'
  AND new_perm."code" = 'news.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
