-- AlterTable
ALTER TABLE "UitleenReservation" ADD COLUMN     "requesterSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UitleenTransportBooking" ADD COLUMN     "requesterSeenAt" TIMESTAMP(3);
