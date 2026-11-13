-- Deellinks voor een budget op de site: een link om te bekijken en een om aan
-- te passen, voor wie geen account heeft (een andere kring) en voor de slides
-- van het BO. Bestaande budgetten krijgen NULL: geen link tot iemand er een
-- maakt.

-- AlterTable
ALTER TABLE "BoBudget" ADD COLUMN "viewToken" TEXT,
ADD COLUMN "editToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BoBudget_viewToken_key" ON "BoBudget"("viewToken");

-- CreateIndex
CREATE UNIQUE INDEX "BoBudget_editToken_key" ON "BoBudget"("editToken");
