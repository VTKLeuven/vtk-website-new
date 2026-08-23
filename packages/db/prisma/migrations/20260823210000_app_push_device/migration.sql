-- Toestellen van de VTK-app die pushberichten willen ontvangen.
-- De tabel komt voor de verzendkant: een pushtoken vraagt native code, en die
-- kan niet via een OTA-update bijgezet worden.

CREATE TYPE "AppPushPlatform" AS ENUM ('ios', 'android');

CREATE TABLE "AppPushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "AppPushPlatform" NOT NULL,
    "appVersion" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppPushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppPushDevice_token_key" ON "AppPushDevice"("token");
CREATE INDEX "AppPushDevice_userId_idx" ON "AppPushDevice"("userId");
CREATE INDEX "AppPushDevice_lastSeenAt_idx" ON "AppPushDevice"("lastSeenAt");

ALTER TABLE "AppPushDevice" ADD CONSTRAINT "AppPushDevice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
