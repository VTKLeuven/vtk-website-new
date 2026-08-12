-- Aankondigingen: het bericht dat als modal op de homepage verschijnt. Meerdere
-- rijen mogen naast elkaar bestaan (elk met hun eigen venster); de homepage
-- toont er hoogstens één en oude rijen blijven staan als historiek.
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyNl" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "ctaLabelNl" TEXT,
    "ctaLabelEn" TEXT,
    "ctaUrl" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_active_startsAt_endsAt_idx" ON "Announcement"("active", "startsAt", "endsAt");

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
