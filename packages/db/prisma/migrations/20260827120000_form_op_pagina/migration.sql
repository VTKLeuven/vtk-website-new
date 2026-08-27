-- Een formulier kan in een contentpagina staan. Uniek: een pagina draagt
-- hoogstens een formulier, zodat de markering `[[formulier]]` in de tekst nooit
-- hoeft te kiezen tussen twee panelen.
-- AlterTable
ALTER TABLE "Form" ADD COLUMN "pageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Form_pageId_key" ON "Form"("pageId");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
