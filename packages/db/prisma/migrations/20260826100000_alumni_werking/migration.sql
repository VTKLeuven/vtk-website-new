-- Alumniwerking: eigen adresboek, zichtbare aanwezigheid en ereleden.
--
-- Vier dingen die samen horen:
--  * `User` krijgt de alumni-context (afstudeerjaar, ooit in VTK, mail-opt-in)
--    en de eretitel die enkel een beheerder zet;
--  * `CalendarEventInterest` krijgt per evenement de keuze wat er publiek mag
--    staan, standaard niets;
--  * `CalendarEventGuestInterest` laat iemand zonder account aanduiden dat hij
--    naar een alumni-evenement komt;
--  * `AlumniContact` is het adresboek per lichting, los van de accounts;
--  * `AccountEmailToken` draagt de bevestigings- en herstelmails van de nieuwe
--    e-mail/wachtwoord-registratie.

-- CreateEnum
CREATE TYPE "AccountEmailTokenKind" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterEnum
ALTER TYPE "TicketAudience" ADD VALUE 'HONORARY';

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "graduationYear" INTEGER,
  ADD COLUMN "wasInVtk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "alumniMailOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "honoraryMember" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CalendarEventInterest"
  ADD COLUMN "showName" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showGraduationYear" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showWasInVtk" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CalendarEventGuestInterest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "displayName" TEXT,
    "graduationYear" INTEGER,
    "wasInVtk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventGuestInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventGuestInterest_eventId_deviceHash_key" ON "CalendarEventGuestInterest"("eventId", "deviceHash");

-- CreateIndex
CREATE INDEX "CalendarEventGuestInterest_eventId_idx" ON "CalendarEventGuestInterest"("eventId");

-- AddForeignKey
ALTER TABLE "CalendarEventGuestInterest" ADD CONSTRAINT "CalendarEventGuestInterest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AlumniContact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "graduationYear" INTEGER,
    "wasInVtk" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "unsubscribedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AlumniContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlumniContact_email_key" ON "AlumniContact"("email");

-- CreateIndex
CREATE INDEX "AlumniContact_graduationYear_idx" ON "AlumniContact"("graduationYear");

-- CreateIndex
CREATE INDEX "AlumniContact_lastName_firstName_idx" ON "AlumniContact"("lastName", "firstName");

-- AddForeignKey
ALTER TABLE "AlumniContact" ADD CONSTRAINT "AlumniContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AccountEmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AccountEmailTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountEmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountEmailToken_tokenHash_key" ON "AccountEmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountEmailToken_userId_kind_idx" ON "AccountEmailToken"("userId", "kind");

-- CreateIndex
CREATE INDEX "AccountEmailToken_expiresAt_idx" ON "AccountEmailToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AccountEmailToken" ADD CONSTRAINT "AccountEmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
