-- CreateTable
CREATE TABLE "CalendarCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "colour" TEXT NOT NULL DEFAULT '#5C667F',
    "order" INTEGER NOT NULL DEFAULT 0,
    "showOnCalendarPage" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventCategory" (
    "eventId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CalendarEventCategory_pkey" PRIMARY KEY ("eventId","categoryId")
);

-- CreateTable
CREATE TABLE "CalendarFeedToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarFeedToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarCategory_slug_key" ON "CalendarCategory"("slug");

-- CreateIndex
CREATE INDEX "CalendarCategory_order_idx" ON "CalendarCategory"("order");

-- CreateIndex
CREATE INDEX "CalendarEventCategory_categoryId_idx" ON "CalendarEventCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeedToken_tokenHash_key" ON "CalendarFeedToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CalendarFeedToken_userId_revokedAt_idx" ON "CalendarFeedToken"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "CalendarEventCategory" ADD CONSTRAINT "CalendarEventCategory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventCategory" ADD CONSTRAINT "CalendarEventCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CalendarCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarFeedToken" ADD CONSTRAINT "CalendarFeedToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

