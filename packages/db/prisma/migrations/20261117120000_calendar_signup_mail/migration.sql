-- De mail "de ticketverkoop of de inschrijvingen zijn open" aan wie interesse
-- aanduidde in een evenement; een rij per lid, evenement en verkoop.
--
-- Wat er met bestaande gegevens gebeurt: niets. Een nieuwe tabel, dus nul
-- rijen. De verzender kijkt enkel naar wat de laatste 24 uur openging, dus na
-- deze migratie krijgt niemand een mail over een verkoop die al langer loopt.

-- CreateTable
CREATE TABLE "CalendarEventSignupMail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "presale" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventSignupMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventSignupMail_eventId_idx" ON "CalendarEventSignupMail"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventSignupMail_userId_eventId_source_key" ON "CalendarEventSignupMail"("userId", "eventId", "source");

-- AddForeignKey
ALTER TABLE "CalendarEventSignupMail" ADD CONSTRAINT "CalendarEventSignupMail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventSignupMail" ADD CONSTRAINT "CalendarEventSignupMail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
