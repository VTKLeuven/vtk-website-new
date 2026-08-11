-- CreateEnum
CREATE TYPE "UitleenDayPart" AS ENUM ('VOORMIDDAG', 'NAMIDDAG', 'AVOND');

-- AlterTable
ALTER TABLE "UitleenReservation" ADD COLUMN     "pickupPart" "UitleenDayPart",
ADD COLUMN     "returnPart" "UitleenDayPart";
