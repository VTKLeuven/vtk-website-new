-- Persoonlijke, intrekbare tokens voor Apple Shortcuts en vergelijkbare
-- automatiseringen. Het ruwe token wordt nooit opgeslagen.

CREATE TABLE "DoorShortcutToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DoorShortcutToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DoorShortcutToken_tokenHash_key" ON "DoorShortcutToken"("tokenHash");
CREATE INDEX "DoorShortcutToken_userId_revokedAt_idx" ON "DoorShortcutToken"("userId", "revokedAt");
CREATE INDEX "DoorShortcutToken_expiresAt_idx" ON "DoorShortcutToken"("expiresAt");

ALTER TABLE "DoorShortcutToken"
ADD CONSTRAINT "DoorShortcutToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
