-- Groepjesmaker bij een formulier (onthaal: peter-metergroepen, internationaal:
-- gemengde kwisploegen). Enkel nieuwe tabellen: bestaande formulieren krijgen
-- geen groepjesmaker tot iemand die op de tab Groepjes aanzet.

-- CreateEnum
CREATE TYPE "FormGroupingRole" AS ENUM ('NAME', 'IDENTIFIER', 'GROUP_SIZE', 'GROUP_NAMES', 'PARTNER', 'ANCHOR', 'ACCEPTS_EXTRA', 'SIMILAR', 'DIVERSE');

-- CreateTable
CREATE TABLE "FormGrouping" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "minMembers" INTEGER NOT NULL DEFAULT 10,
    "maxMembers" INTEGER NOT NULL DEFAULT 15,
    "minGroups" INTEGER,
    "maxGroups" INTEGER,
    "minAnchors" INTEGER,
    "maxAnchors" INTEGER,
    "autoRun" BOOLEAN NOT NULL DEFAULT false,
    "expectedPeople" INTEGER,
    "ranAt" TIMESTAMPTZ(3),
    "ranById" TEXT,
    "manualMoves" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FormGrouping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormGroupingField" (
    "id" TEXT NOT NULL,
    "groupingId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "role" "FormGroupingRole" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "FormGroupingField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormGroupingGroup" (
    "id" TEXT NOT NULL,
    "groupingId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "FormGroupingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormGroupingMember" (
    "id" TEXT NOT NULL,
    "groupingId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "isAnchor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FormGroupingMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormGrouping_formId_key" ON "FormGrouping"("formId");

-- CreateIndex
CREATE INDEX "FormGroupingField_fieldId_idx" ON "FormGroupingField"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "FormGroupingField_groupingId_fieldId_key" ON "FormGroupingField"("groupingId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "FormGroupingGroup_groupingId_number_key" ON "FormGroupingGroup"("groupingId", "number");

-- CreateIndex
CREATE INDEX "FormGroupingMember_groupId_idx" ON "FormGroupingMember"("groupId");

-- CreateIndex
CREATE INDEX "FormGroupingMember_entryId_idx" ON "FormGroupingMember"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "FormGroupingMember_groupingId_entryId_key" ON "FormGroupingMember"("groupingId", "entryId");

-- AddForeignKey
ALTER TABLE "FormGrouping" ADD CONSTRAINT "FormGrouping_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGrouping" ADD CONSTRAINT "FormGrouping_ranById_fkey" FOREIGN KEY ("ranById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupingField" ADD CONSTRAINT "FormGroupingField_groupingId_fkey" FOREIGN KEY ("groupingId") REFERENCES "FormGrouping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupingField" ADD CONSTRAINT "FormGroupingField_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupingGroup" ADD CONSTRAINT "FormGroupingGroup_groupingId_fkey" FOREIGN KEY ("groupingId") REFERENCES "FormGrouping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupingMember" ADD CONSTRAINT "FormGroupingMember_groupingId_fkey" FOREIGN KEY ("groupingId") REFERENCES "FormGrouping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupingMember" ADD CONSTRAINT "FormGroupingMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FormGroupingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupingMember" ADD CONSTRAINT "FormGroupingMember_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FormEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

