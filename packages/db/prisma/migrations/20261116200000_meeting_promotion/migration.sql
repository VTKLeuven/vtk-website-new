-- Logboek van reclamemomenten per bureau (een mail, een story), zelf ingevuld
-- op /admin/bureau/statistieken en getoond als markering op de cumulatieve lijn.
--
-- Wat er met bestaande gegevens gebeurt: niets. Een nieuwe tabel, dus nul
-- rijen; een bureau van voor deze migratie heeft gewoon geen momenten.

-- CreateTable
CREATE TABLE "MeetingPromotion" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT,
    "sourceCampaign" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingPromotion_meetingId_at_idx" ON "MeetingPromotion"("meetingId", "at");

-- AddForeignKey
ALTER TABLE "MeetingPromotion" ADD CONSTRAINT "MeetingPromotion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPromotion" ADD CONSTRAINT "MeetingPromotion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
