-- CreateTable
CREATE TABLE "LesbezoekScheduledMail" (
    "id" TEXT NOT NULL,
    "lesbezoekId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sendAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "failedReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LesbezoekScheduledMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LesbezoekScheduledMail_sendAt_sentAt_idx" ON "LesbezoekScheduledMail"("sendAt", "sentAt");

-- CreateIndex
CREATE INDEX "LesbezoekScheduledMail_lesbezoekId_idx" ON "LesbezoekScheduledMail"("lesbezoekId");

-- AddForeignKey
ALTER TABLE "LesbezoekScheduledMail" ADD CONSTRAINT "LesbezoekScheduledMail_lesbezoekId_fkey" FOREIGN KEY ("lesbezoekId") REFERENCES "Lesbezoek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LesbezoekScheduledMail" ADD CONSTRAINT "LesbezoekScheduledMail_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
