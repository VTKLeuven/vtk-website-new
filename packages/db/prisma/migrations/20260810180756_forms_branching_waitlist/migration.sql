-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "allowWaitlist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stepBySections" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FormEntry" ADD COLUMN     "waitlisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitlistedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "FormFieldOption" ADD COLUMN     "allowWaitlist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endsForm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextSectionId" TEXT;

-- AlterTable
ALTER TABLE "FormSection" ADD COLUMN     "endsForm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextSectionId" TEXT;

-- CreateIndex
CREATE INDEX "FormSection_nextSectionId_idx" ON "FormSection"("nextSectionId");

-- AddForeignKey
ALTER TABLE "FormSection" ADD CONSTRAINT "FormSection_nextSectionId_fkey" FOREIGN KEY ("nextSectionId") REFERENCES "FormSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldOption" ADD CONSTRAINT "FormFieldOption_nextSectionId_fkey" FOREIGN KEY ("nextSectionId") REFERENCES "FormSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
