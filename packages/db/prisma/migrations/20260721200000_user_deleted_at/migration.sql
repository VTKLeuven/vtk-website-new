-- Tombstone-markering voor geanonimiseerde accounts (zie lib/privacy/account.ts).
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Bestaande tombstones alsnog markeren: die kregen bij het wissen een
-- `deleted+<uuid>@vtk.invalid`-adres, en dat domein wordt nergens anders gebruikt.
UPDATE "User" SET "deletedAt" = NOW() WHERE "email" LIKE 'deleted+%@vtk.invalid';

-- Elke gebruikerslijst filtert hierop; index zodat dat geen seq scan wordt.
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
