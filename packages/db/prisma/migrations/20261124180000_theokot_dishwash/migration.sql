-- Afwasbeurten in Theokot, de opvolger van de Excel "bekers afwassen": een
-- post, werkgroep of jaarwerking noteert wat er na een evenement af te wassen
-- valt en boekt een of meer uren van een namiddag om het te doen. Een nieuwe tabel, dus er is niets
-- van voordien om in te vullen; de open regels uit de Excel tikt Theokot zelf
-- over. Zie docs/design-decisions.md, "Theokot: afwasbeurten".

-- CreateEnum
CREATE TYPE "TheokotDishwashKind" AS ENUM ('ECOCUPS', 'GLAZEN', 'KOMMETJES', 'ANDERS');

-- CreateTable
CREATE TABLE "TheokotDishwash" (
    "id" TEXT NOT NULL,
    "day" DATE,
    "groupId" TEXT NOT NULL,
    "kinds" "TheokotDishwashKind"[],
    "quantity" TEXT NOT NULL,
    "eventDate" DATE,
    "note" TEXT,
    "washedAt" TIMESTAMPTZ(3),
    "washedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderSentAt" TIMESTAMPTZ(3),
    "closedNoticeSentAt" TIMESTAMPTZ(3),
    "noticeSentAt" TIMESTAMPTZ(3),
    "pickReminderSentAt" TIMESTAMPTZ(3),

    CONSTRAINT "TheokotDishwash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheokotDishwashHour" (
    "id" TEXT NOT NULL,
    "dishwashId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "hour" INTEGER NOT NULL,

    CONSTRAINT "TheokotDishwashHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TheokotDishwash_day_idx" ON "TheokotDishwash"("day");

-- CreateIndex
CREATE UNIQUE INDEX "TheokotDishwashHour_day_hour_key" ON "TheokotDishwashHour"("day", "hour");

-- CreateIndex
CREATE INDEX "TheokotDishwashHour_dishwashId_idx" ON "TheokotDishwashHour"("dishwashId");

-- CreateIndex
CREATE INDEX "TheokotDishwash_groupId_idx" ON "TheokotDishwash"("groupId");

-- CreateIndex
CREATE INDEX "TheokotDishwash_washedAt_idx" ON "TheokotDishwash"("washedAt");

-- AddForeignKey
ALTER TABLE "TheokotDishwash" ADD CONSTRAINT "TheokotDishwash_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotDishwash" ADD CONSTRAINT "TheokotDishwash_washedById_fkey" FOREIGN KEY ("washedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotDishwashHour" ADD CONSTRAINT "TheokotDishwashHour_dishwashId_fkey" FOREIGN KEY ("dishwashId") REFERENCES "TheokotDishwash"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheokotDishwash" ADD CONSTRAINT "TheokotDishwash_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
