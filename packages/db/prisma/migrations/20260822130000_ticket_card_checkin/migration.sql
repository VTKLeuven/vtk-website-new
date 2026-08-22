-- AlterTable
ALTER TABLE "TicketEvent" ADD COLUMN     "cardCheckIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TicketOrderItem" ADD COLUMN     "rNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrderItem_eventId_rNumber_key" ON "TicketOrderItem"("eventId", "rNumber");
