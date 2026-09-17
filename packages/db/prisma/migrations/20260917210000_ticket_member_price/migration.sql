-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "memberPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "TicketOrderItem" ADD COLUMN     "memberPrice" BOOLEAN NOT NULL DEFAULT false;
