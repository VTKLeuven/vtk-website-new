-- De VTK-app: interesse in evenementen, gevolgde categorieen, meldingsvoorkeuren
-- en bonnetjes die aan een toog betaald worden.
--
-- Drie markeringen voor pushberichten (`CalendarEvent.announcedPushAt`,
-- `TheokotSession.orderOpenPushedAt`, `CalendarEventInterest.remindedAt`) volgen
-- dezelfde claim-dan-versturen-aanpak als `TheokotOrder.pickupPushedAt`: de
-- markering gaat om in een voorwaardelijke update, en enkel wie die wint stuurt.

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "announcedPushAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "TheokotSession" ADD COLUMN     "orderOpenPushedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "CalendarEventInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CalendarEventInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarCategoryFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarCategoryFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftRewardRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processedById" TEXT,
    "amount" INTEGER NOT NULL,
    "place" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftRewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventInterest_eventId_idx" ON "CalendarEventInterest"("eventId");

-- CreateIndex
CREATE INDEX "CalendarEventInterest_remindedAt_idx" ON "CalendarEventInterest"("remindedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventInterest_userId_eventId_key" ON "CalendarEventInterest"("userId", "eventId");

-- CreateIndex
CREATE INDEX "CalendarCategoryFollow_categoryId_idx" ON "CalendarCategoryFollow"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarCategoryFollow_userId_categoryId_key" ON "CalendarCategoryFollow"("userId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AppNotificationPreference_userId_topic_key" ON "AppNotificationPreference"("userId", "topic");

-- CreateIndex
CREATE INDEX "ShiftRewardRedemption_userId_createdAt_idx" ON "ShiftRewardRedemption"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ShiftRewardRedemption_createdAt_idx" ON "ShiftRewardRedemption"("createdAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_publishedAt_announcedPushAt_idx" ON "CalendarEvent"("publishedAt", "announcedPushAt");

-- CreateIndex
CREATE INDEX "TheokotSession_isOpen_orderOpenPushedAt_orderOpenAt_idx" ON "TheokotSession"("isOpen", "orderOpenPushedAt", "orderOpenAt");

-- AddForeignKey
ALTER TABLE "CalendarEventInterest" ADD CONSTRAINT "CalendarEventInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventInterest" ADD CONSTRAINT "CalendarEventInterest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCategoryFollow" ADD CONSTRAINT "CalendarCategoryFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCategoryFollow" ADD CONSTRAINT "CalendarCategoryFollow_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CalendarCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppNotificationPreference" ADD CONSTRAINT "AppNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRewardRedemption" ADD CONSTRAINT "ShiftRewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRewardRedemption" ADD CONSTRAINT "ShiftRewardRedemption_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

