-- Hoe de VTK-app gebruikt wordt, voor Admin › Website › App: installaties,
-- sessies, schermen per dag en wat er in de app besteld of gedaan werd.

CREATE TABLE "AppInstall" (
    "id" TEXT NOT NULL,
    "platform" "AppPushPlatform" NOT NULL,
    "osVersion" TEXT,
    "deviceModel" TEXT,
    "appVersion" TEXT,
    "runtimeVersion" TEXT,
    "updateId" TEXT,
    "channel" TEXT,
    "expoGo" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'nl',
    "pushEnabled" BOOLEAN,
    "userId" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppInstall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "userId" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "screenViews" INTEGER NOT NULL DEFAULT 0,
    "appVersion" TEXT,

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppScreenDay" (
    "day" DATE NOT NULL,
    "installId" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "tab" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL,

    CONSTRAINT "AppScreenDay_pkey" PRIMARY KEY ("day","installId","screen","tab")
);

CREATE TABLE "AppAction" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "installId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppInstall_firstSeenAt_idx" ON "AppInstall"("firstSeenAt");
CREATE INDEX "AppInstall_lastSeenAt_idx" ON "AppInstall"("lastSeenAt");
CREATE INDEX "AppInstall_userId_idx" ON "AppInstall"("userId");
CREATE INDEX "AppSession_startedAt_idx" ON "AppSession"("startedAt");
CREATE INDEX "AppSession_installId_startedAt_idx" ON "AppSession"("installId", "startedAt");
CREATE INDEX "AppScreenDay_day_idx" ON "AppScreenDay"("day");
CREATE INDEX "AppAction_kind_createdAt_idx" ON "AppAction"("kind", "createdAt");
CREATE INDEX "AppAction_refId_idx" ON "AppAction"("refId");

ALTER TABLE "AppInstall" ADD CONSTRAINT "AppInstall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_installId_fkey" FOREIGN KEY ("installId") REFERENCES "AppInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppScreenDay" ADD CONSTRAINT "AppScreenDay_installId_fkey" FOREIGN KEY ("installId") REFERENCES "AppInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppAction" ADD CONSTRAINT "AppAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
