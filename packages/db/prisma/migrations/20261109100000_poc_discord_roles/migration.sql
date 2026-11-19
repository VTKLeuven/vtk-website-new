-- Een rol en een kanaal per POC op de studentendiscord. Bestaande POC's hebben er
-- nog geen en bestaande koppelingen nog geen rollen: tot iemand de rol en het
-- kanaal instelt in /admin/pocs verandert er voor hen niets.
ALTER TABLE "Poc" ADD COLUMN "discordRoleId" TEXT;
ALTER TABLE "Poc" ADD COLUMN "discordChannelId" TEXT;

ALTER TABLE "User" ADD COLUMN "discordRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
