-- Discord-webhooks van de kalender: de kanalen en per kanaal welk evenement er
-- gepost is. Twee nieuwe tabellen, dus geen bestaande rijen om over te beslissen.
-- Een webhook post vanzelf enkel wat ná zijn `autoSince` gepubliceerd wordt; de
-- evenementen die er al stonden, krijgen dus niets tot iemand ze met de hand post.

-- CreateEnum
CREATE TYPE "DiscordPostStatus" AS ENUM ('SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "DiscordPostTrigger" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "DiscordWebhook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSince" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discordName" TEXT,
    "channelId" TEXT,
    "guildId" TEXT,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscordWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordWebhookPost" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "DiscordPostStatus" NOT NULL DEFAULT 'SENDING',
    "trigger" "DiscordPostTrigger" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "messageId" TEXT,
    "postedAt" TIMESTAMPTZ(3),
    "linkKind" TEXT,
    "linkLabel" TEXT,
    "infoClicks" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "lastClickAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscordWebhookPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordWebhook_url_key" ON "DiscordWebhook"("url");

-- CreateIndex
CREATE INDEX "DiscordWebhookPost_eventId_idx" ON "DiscordWebhookPost"("eventId");

-- CreateIndex
CREATE INDEX "DiscordWebhookPost_status_idx" ON "DiscordWebhookPost"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordWebhookPost_webhookId_eventId_key" ON "DiscordWebhookPost"("webhookId", "eventId");

-- AddForeignKey
ALTER TABLE "DiscordWebhookPost" ADD CONSTRAINT "DiscordWebhookPost_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "DiscordWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordWebhookPost" ADD CONSTRAINT "DiscordWebhookPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

