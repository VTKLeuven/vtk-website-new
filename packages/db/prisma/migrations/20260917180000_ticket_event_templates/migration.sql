-- Ticketsjablonen: een terugkerend evenement (cantus) in één keer klaarzetten.
-- Het sjabloon bewaart offsets t.o.v. de start, geen datums.

-- CreateTable
CREATE TABLE "TicketEventTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "ownerGroupId" TEXT,
    "titleNl" TEXT NOT NULL DEFAULT '',
    "titleEn" TEXT NOT NULL DEFAULT '',
    "descriptionNl" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "locationAddress" TEXT,
    "locationLatitude" DOUBLE PRECISION,
    "locationLongitude" DOUBLE PRECISION,
    "timeOfDay" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 300,
    "salesOpensMinutesBefore" INTEGER,
    "salesClosesMinutesBefore" INTEGER,
    "maxTicketsPerOrder" INTEGER NOT NULL DEFAULT 8,
    "contactEmail" TEXT,
    "cardCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "openScanning" BOOLEAN NOT NULL DEFAULT true,
    "presaleLeadMinutes" INTEGER,
    "presalePraesidium" BOOLEAN NOT NULL DEFAULT true,
    "confirmationMessageNl" TEXT NOT NULL DEFAULT '',
    "confirmationMessageEn" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "design" JSONB,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketEventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEventTemplateType" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "descriptionNl" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "unitPriceCents" INTEGER NOT NULL,
    "audience" "TicketAudience" NOT NULL DEFAULT 'PUBLIC',
    "color" TEXT NOT NULL DEFAULT 'navy',
    "minPerOrder" INTEGER NOT NULL DEFAULT 1,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 8,
    "salesOpensMinutesBefore" INTEGER,
    "salesClosesMinutesBefore" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TicketEventTemplateType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEventTemplateQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL DEFAULT '',
    "descriptionNl" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "type" "TicketQuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "ticketTypeCode" TEXT,

    CONSTRAINT "TicketEventTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketEventTemplate_slug_key" ON "TicketEventTemplate"("slug");

-- CreateIndex
CREATE INDEX "TicketEventTemplate_order_idx" ON "TicketEventTemplate"("order");

-- CreateIndex
CREATE INDEX "TicketEventTemplateType_templateId_order_idx" ON "TicketEventTemplateType"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TicketEventTemplateType_templateId_code_key" ON "TicketEventTemplateType"("templateId", "code");

-- CreateIndex
CREATE INDEX "TicketEventTemplateQuestion_templateId_order_idx" ON "TicketEventTemplateQuestion"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TicketEventTemplateQuestion_templateId_code_key" ON "TicketEventTemplateQuestion"("templateId", "code");

-- AddForeignKey
ALTER TABLE "TicketEventTemplate" ADD CONSTRAINT "TicketEventTemplate_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventTemplate" ADD CONSTRAINT "TicketEventTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventTemplateType" ADD CONSTRAINT "TicketEventTemplateType_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TicketEventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventTemplateQuestion" ADD CONSTRAINT "TicketEventTemplateQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TicketEventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

