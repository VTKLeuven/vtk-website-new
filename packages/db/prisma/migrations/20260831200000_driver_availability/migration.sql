-- Wanneer een chauffeur kan rijden (V1).
--
-- Vensters en geen herhalend rooster: een chauffeur weet "zaterdagvoormiddag kan
-- ik" en niet "elke tweede week van 9 tot 12". Vensters in het verleden blijven
-- staan; die zeggen achteraf wie er die dag kon.
CREATE TABLE "UitleenDriverAvailability" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UitleenDriverAvailability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UitleenDriverAvailability_userId_startAt_idx" ON "UitleenDriverAvailability"("userId", "startAt");
CREATE INDEX "UitleenDriverAvailability_startAt_endAt_idx" ON "UitleenDriverAvailability"("startAt", "endAt");

ALTER TABLE "UitleenDriverAvailability"
  ADD CONSTRAINT "UitleenDriverAvailability_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
