-- AlterTable
ALTER TABLE "TicketEvent" ADD COLUMN     "presaleToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TicketEvent_presaleToken_key" ON "TicketEvent"("presaleToken");
