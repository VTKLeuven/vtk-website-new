-- AlterTable
ALTER TABLE "UitleenReservationLine" ADD COLUMN     "preparedAt" TIMESTAMP(3),
ADD COLUMN     "preparedById" TEXT;

-- AddForeignKey
ALTER TABLE "UitleenReservationLine" ADD CONSTRAINT "UitleenReservationLine_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
