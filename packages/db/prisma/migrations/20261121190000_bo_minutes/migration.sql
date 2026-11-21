-- Het verslag van elke BO en de aanwezigheden erin (/admin/apps/aanwezigheden).
-- Een nieuwe tabel: nul rijen bij het uitrollen. De volgende scan van de
-- BO-map (om het halfuur, of "Nu lezen") vult ze voor het lopende en het vorige
-- werkingsjaar; aan bestaande vergaderingen en bestanden verandert niets.
CREATE TABLE "BoMinutes" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "webUrl" TEXT NOT NULL,
    "driveModifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "title" TEXT,
    "attendance" JSONB,
    "error" TEXT,
    "readFor" TIMESTAMPTZ(3),
    "readVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "missingSince" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BoMinutes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoMinutes_meetingId_key" ON "BoMinutes"("meetingId");

ALTER TABLE "BoMinutes" ADD CONSTRAINT "BoMinutes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "BoMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
