-- AlterTable
ALTER TABLE "PocRepresentative" ADD COLUMN "year" INTEGER;
UPDATE "PocRepresentative" SET "year" = 2026 WHERE "year" IS NULL;
ALTER TABLE "PocRepresentative" ALTER COLUMN "year" SET NOT NULL;

-- DropIndex
DROP INDEX "PocRepresentative_pocId_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "PocRepresentative_pocId_userId_year_key" ON "PocRepresentative"("pocId", "userId", "year");

-- CreateIndex
CREATE INDEX "PocRepresentative_pocId_idx" ON "PocRepresentative"("pocId");

-- CreateIndex
CREATE INDEX "PocRepresentative_year_idx" ON "PocRepresentative"("year");
