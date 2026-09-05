-- CreateEnum
CREATE TYPE "UitleenAvailabilityKind" AS ENUM ('JA', 'LIEVER_NIET', 'NOOD');

-- AlterTable
ALTER TABLE "UitleenDriverAvailability" ADD COLUMN     "kind" "UitleenAvailabilityKind" NOT NULL DEFAULT 'JA';
