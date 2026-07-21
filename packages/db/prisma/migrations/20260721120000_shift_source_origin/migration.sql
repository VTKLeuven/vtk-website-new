-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shift_sourceSystem_sourceId_key" ON "Shift"("sourceSystem", "sourceId");
