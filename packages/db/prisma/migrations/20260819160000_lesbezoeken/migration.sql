-- CreateEnum
CREATE TYPE "LesbezoekStatus" AS ENUM ('PENDING', 'ASKED', 'APPROVED', 'DECLINED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "LesbezoekOrganisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '#3B82F6',
    "contactEmail" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LesbezoekOrganisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesbezoek" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "longVisit" BOOLEAN NOT NULL DEFAULT false,
    "audience" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacherNote" TEXT NOT NULL,
    "teacherEmail" TEXT NOT NULL,
    "teacherName" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "requesterPhone" TEXT,
    "status" "LesbezoekStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "professorMailedAt" TIMESTAMPTZ(3),
    "professorNudgedAt" TIMESTAMPTZ(3),
    "requesterNotifiedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lesbezoek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LesbezoekPeculiarity" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LesbezoekPeculiarity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LesbezoekOrganisation_name_key" ON "LesbezoekOrganisation"("name");

-- CreateIndex
CREATE INDEX "LesbezoekOrganisation_active_name_idx" ON "LesbezoekOrganisation"("active", "name");

-- CreateIndex
CREATE INDEX "Lesbezoek_startsAt_idx" ON "Lesbezoek"("startsAt");

-- CreateIndex
CREATE INDEX "Lesbezoek_status_startsAt_idx" ON "Lesbezoek"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Lesbezoek_organisationId_startsAt_idx" ON "Lesbezoek"("organisationId", "startsAt");

-- CreateIndex
CREATE INDEX "Lesbezoek_teacherEmail_startsAt_idx" ON "Lesbezoek"("teacherEmail", "startsAt");

-- CreateIndex
CREATE INDEX "LesbezoekPeculiarity_subject_idx" ON "LesbezoekPeculiarity"("subject");

-- AddForeignKey
ALTER TABLE "Lesbezoek" ADD CONSTRAINT "Lesbezoek_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "LesbezoekOrganisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesbezoek" ADD CONSTRAINT "Lesbezoek_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesbezoek" ADD CONSTRAINT "Lesbezoek_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
