-- Categorieën voor groepsadressen (Praesidium > Activiteiten), enkel voor het
-- overzicht op /admin/groepsadressen.
--
-- Wat er met bestaande rijen gebeurt: elk groepsadres krijgt categoryId NULL
-- en staat dus onder "Zonder categorie". Er bestaan nog geen categorieen; de
-- sync leest de kolom niet, dus in Google verandert er niets.

-- CreateTable
CREATE TABLE "MailGroupCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailGroupCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "MailGroup" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "MailGroupCategory_parentId_idx" ON "MailGroupCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroupCategory_parentId_name_key" ON "MailGroupCategory"("parentId", "name");

-- CreateIndex
CREATE INDEX "MailGroup_categoryId_idx" ON "MailGroup"("categoryId");

-- AddForeignKey
ALTER TABLE "MailGroup" ADD CONSTRAINT "MailGroup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MailGroupCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGroupCategory" ADD CONSTRAINT "MailGroupCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MailGroupCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
