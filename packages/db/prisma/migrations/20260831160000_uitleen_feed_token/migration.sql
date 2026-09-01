-- Abonneerbare agendafeed op de transportplanning (A1).
--
-- Een agenda-client stuurt geen cookies mee, dus het geheim zit in de URL. Enkel
-- de sha256 staat hier; het token zelf staat nergens en is na het aanmaken één
-- keer te kopiëren. `revokedAt` in plaats van verwijderen, zodat je in de lijst
-- ziet dat een abonnement bestaan heeft.
CREATE TYPE "UitleenFeedScope" AS ENUM ('TEAM', 'DRIVER');

CREATE TABLE "UitleenFeedToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "scope" "UitleenFeedScope" NOT NULL DEFAULT 'TEAM',
  "tokenHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "UitleenFeedToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UitleenFeedToken_tokenHash_key" ON "UitleenFeedToken"("tokenHash");
CREATE INDEX "UitleenFeedToken_userId_revokedAt_idx" ON "UitleenFeedToken"("userId", "revokedAt");

ALTER TABLE "UitleenFeedToken"
  ADD CONSTRAINT "UitleenFeedToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
