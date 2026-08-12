-- CreateEnum
CREATE TYPE "CalendarAudience" AS ENUM ('FIRST_YEARS', 'INTERNATIONALS');

-- AlterTable
ALTER TABLE "CalendarCategory" ADD COLUMN     "audience" "CalendarAudience";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "internationalStudent" BOOLEAN NOT NULL DEFAULT false;

