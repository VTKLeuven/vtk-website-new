-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "manualGrantId" TEXT;

-- CreateTable
CREATE TABLE "ManualShiftGrant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "post" TEXT,
    "reason" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL DEFAULT 0,
    "payedOut" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,

    CONSTRAINT "ManualShiftGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualShiftGrant_userId_idx" ON "ManualShiftGrant"("userId");

-- CreateIndex
CREATE INDEX "ManualShiftGrant_academicYear_idx" ON "ManualShiftGrant"("academicYear");

-- CreateIndex
CREATE INDEX "ManualShiftGrant_createdAt_idx" ON "ManualShiftGrant"("createdAt");

-- CreateIndex
CREATE INDEX "Shift_manualGrantId_idx" ON "Shift"("manualGrantId");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_manualGrantId_fkey" FOREIGN KEY ("manualGrantId") REFERENCES "ManualShiftGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualShiftGrant" ADD CONSTRAINT "ManualShiftGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualShiftGrant" ADD CONSTRAINT "ManualShiftGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- De permissie zelf: shift.manual
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES (
  'permission-shift-manual',
  'shift.manual',
  'Manueel extra shiften toekennen',
  'Manually grant extra shifts',
  'shift'
)
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

-- Enkel aan admin users standaard.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."code" = 'admin'
  AND permission."code" = 'shift.manual'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
