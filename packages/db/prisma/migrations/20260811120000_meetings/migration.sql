-- Broodjesmomenten: grocomeet (GM) en VTK Bureau.
--
-- Twee vergaderingen met dezelfde werking (vooraf een broodje en een drankje
-- bestellen, broodjes gaan van de Theokot-voorraad af en gaan in een aparte
-- doos), dus één model met een `kind`. Zie docs/design-decisions.md voor het
-- waarom achter de gedeelde tabel en de snapshots.

CREATE TYPE "MeetingKind" AS ENUM ('GROCOMEET', 'BUREAU');
CREATE TYPE "MeetingReservationStatus" AS ENUM ('ACTIVE', 'INVALIDATED');

CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "kind" "MeetingKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT,
    "opensAt" TIMESTAMPTZ(3),
    "useTheokot" BOOLEAN NOT NULL DEFAULT true,
    "noteNl" TEXT,
    "noteEn" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Meeting_slug_key" ON "Meeting"("slug");
CREATE INDEX "Meeting_kind_startsAt_idx" ON "Meeting"("kind", "startsAt");
CREATE INDEX "Meeting_year_semester_kind_idx" ON "Meeting"("year", "semester", "kind");

CREATE TABLE "MeetingOption" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MeetingOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingOption_meetingId_idx" ON "MeetingOption"("meetingId");

CREATE TABLE "MeetingReservation" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MeetingReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "itemNameNl" TEXT,
    "itemNameEn" TEXT,
    "itemPriceCents" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT,
    "optionId" TEXT,
    "sessionItemId" TEXT,
    "drinkName" TEXT,
    "drinkPriceCents" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "invalidatedAt" TIMESTAMPTZ(3),
    "invalidatedReason" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MeetingReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingReservation_meetingId_userId_key" ON "MeetingReservation"("meetingId", "userId");
CREATE INDEX "MeetingReservation_userId_status_idx" ON "MeetingReservation"("userId", "status");
CREATE INDEX "MeetingReservation_sessionItemId_idx" ON "MeetingReservation"("sessionItemId");
CREATE INDEX "MeetingReservation_status_paidAt_idx" ON "MeetingReservation"("status", "paidAt");

CREATE TABLE "MeetingPlan" (
    "id" TEXT NOT NULL,
    "kind" "MeetingKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "plannedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MeetingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingPlan_kind_year_semester_key" ON "MeetingPlan"("kind", "year", "semester");

ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingOption" ADD CONSTRAINT "MeetingOption_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingReservation" ADD CONSTRAINT "MeetingReservation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingReservation" ADD CONSTRAINT "MeetingReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingReservation" ADD CONSTRAINT "MeetingReservation_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingReservation" ADD CONSTRAINT "MeetingReservation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MeetingOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingReservation" ADD CONSTRAINT "MeetingReservation_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "TheokotSessionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingPlan" ADD CONSTRAINT "MeetingPlan_plannedById_fkey" FOREIGN KEY ("plannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
