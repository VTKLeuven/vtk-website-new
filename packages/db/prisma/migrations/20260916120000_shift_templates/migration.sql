-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "eventName" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "post" TEXT,
    "timeOfDay" TEXT,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplateEntry" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startOffsetMinutes" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT,
    "location" TEXT,
    "ownPost" BOOLEAN NOT NULL DEFAULT false,
    "post" TEXT,
    "openToInternationals" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShiftTemplateEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftTemplate_slug_key" ON "ShiftTemplate"("slug");

-- CreateIndex
CREATE INDEX "ShiftTemplateEntry_templateId_order_idx" ON "ShiftTemplateEntry"("templateId", "order");

-- AddForeignKey
ALTER TABLE "ShiftTemplateEntry" ADD CONSTRAINT "ShiftTemplateEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ShiftTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
