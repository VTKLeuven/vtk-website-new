-- Technisch logboek voor elke uitgaande mailpoging vanuit de website.
-- De toepassing snoeit dit na 30 dagen; bijlagen worden enkel als metadata
-- bijgehouden, zodat pdf's en tickets niet dubbel in de database belanden.
CREATE TYPE "EmailLogStatus" AS ENUM ('SENT', 'PARTIAL', 'FAILED', 'SIMULATED');

CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" "EmailLogStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "providerMessageId" TEXT,
    "providerResponse" TEXT,
    "accepted" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "rejected" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");
