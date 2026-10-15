-- Bestuursorgaan: welke budgetten en resultaten er per post langs het BO
-- passeerden, gelezen uit de gedeelde drive Praesidium (lib/bo/scan.ts).
--
-- Drie nieuwe tabellen, dus geen bestaande rijen om over te beslissen: de
-- eerste scan vult ze. Zie docs/design-decisions.md ("Bestuursorgaan").

-- CreateEnum
CREATE TYPE "BoMeetingKind" AS ENUM ('MEETING', 'BUDGET_MEETING', 'WRITTEN');

-- CreateEnum
CREATE TYPE "BoDocumentKind" AS ENUM ('BUDGET', 'RESULT');

-- CreateTable
CREATE TABLE "BoMeeting" (
    "id" TEXT NOT NULL,
    "workingYear" INTEGER NOT NULL,
    "driveFolderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BoMeetingKind" NOT NULL,
    "number" INTEGER,
    "date" DATE,
    "webUrl" TEXT NOT NULL,
    "missingSince" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BoMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoDocument" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "webUrl" TEXT NOT NULL,
    "folderKind" "BoDocumentKind",
    "driveModifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "sheetPost" TEXT,
    "sheetTitle" TEXT,
    "eventDate" DATE,
    "budgetIncomeCents" INTEGER,
    "budgetExpenseCents" INTEGER,
    "budgetTotalCents" INTEGER,
    "resultIncomeCents" INTEGER,
    "resultExpenseCents" INTEGER,
    "resultTotalCents" INTEGER,
    "allocationCents" INTEGER,
    "vtkSharePercent" INTEGER,
    "lines" JSONB,
    "location" TEXT,
    "figuresError" TEXT,
    "figuresReadFor" TIMESTAMPTZ(3),
    "pairedBudgetId" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "missingSince" TIMESTAMPTZ(3),

    CONSTRAINT "BoDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoPostAlias" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BoPostAlias_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoMeeting_driveFolderId_key" ON "BoMeeting"("driveFolderId");

-- CreateIndex
CREATE INDEX "BoMeeting_workingYear_idx" ON "BoMeeting"("workingYear");

-- CreateIndex
CREATE INDEX "BoDocument_driveFileId_idx" ON "BoDocument"("driveFileId");

-- CreateIndex
CREATE INDEX "BoDocument_pairedBudgetId_idx" ON "BoDocument"("pairedBudgetId");

-- CreateIndex
CREATE UNIQUE INDEX "BoDocument_meetingId_driveFileId_key" ON "BoDocument"("meetingId", "driveFileId");

-- CreateIndex
CREATE INDEX "BoPostAlias_groupId_idx" ON "BoPostAlias"("groupId");

-- AddForeignKey
ALTER TABLE "BoDocument" ADD CONSTRAINT "BoDocument_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "BoMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoDocument" ADD CONSTRAINT "BoDocument_pairedBudgetId_fkey" FOREIGN KEY ("pairedBudgetId") REFERENCES "BoDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoPostAlias" ADD CONSTRAINT "BoPostAlias_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- De permissie. Zelfde vorm als 20261014150000_cash_registers.
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-bestuursorgaan-manage',
  'bestuursorgaan.manage',
  'Budgetten en resultaten van het Bestuursorgaan opvolgen',
  'Follow up budgets and results of the board meeting',
  'bestuursorgaan'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

-- Enkel Groep 5. Bewust een eigen rol en níét de rol admin: die dragen IT en
-- Groep 5 allebei, en IT hoort de cijfers van de posten niet te zien omdat het
-- de koppeling opzette. Een eigen rol laat het beheer haar later los aan
-- iemand geven (een penning die niet in Groep 5 zit) zonder admin mee te geven.
INSERT INTO "Role" ("id", "code", "nameNl", "nameEn", "descriptionNl", "descriptionEn", "order", "system", "createdAt", "updatedAt")
VALUES (
  'role-bestuursorgaan',
  'bestuursorgaan',
  'Bestuursorgaan',
  'Board meeting',
  'Opvolgen welke budgetten en resultaten per post langs het Bestuursorgaan passeerden, met de bedragen uit de rekenbladen.',
  'Follow up which budgets and results each post took to the board meeting, with the amounts from the spreadsheets.',
  10,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."code" = 'bestuursorgaan' AND permission."code" = 'bestuursorgaan.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "GroupRole" ("groupId", "roleId", "kind")
SELECT grp."id", role."id", 'DEFAULT'
FROM "Group" AS grp
CROSS JOIN "Role" AS role
WHERE grp."code" = 'GROEP5' AND role."code" = 'bestuursorgaan'
ON CONFLICT ("groupId", "roleId", "kind") DO NOTHING;
