-- CreateEnum
CREATE TYPE "GroupLeadLabel" AS ENUM ('G3', 'G4');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "leadLabel" "GroupLeadLabel" NOT NULL DEFAULT 'G3';
