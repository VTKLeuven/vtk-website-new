-- Een peiling zonder POC is een algemene peiling van VTK Onderwijs, voor de
-- studenten van alle richtingen. Bestaande peilingen houden hun POC.
--
-- Het Discord-kanaal kies je voortaan per peiling (die kolom bestond al op
-- PocPoll). Poc.discordChannelId blijft staan als startwaarde voor een POC die
-- nog geen peiling postte; er verandert niets aan een bestaande peiling.
ALTER TABLE "PocPoll" ALTER COLUMN "pocId" DROP NOT NULL;

-- Een POC kan nu meerdere Discord-rollen hebben, elk eventueel voor bepaalde
-- fases. De rol die er al stond, blijft de rol van de hele POC (geen fases),
-- zodat niemand een rol verliest of bijkrijgt door deze migratie.
CREATE TABLE "PocDiscordRole" (
    "pocId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "studyYears" "StudyYear"[] DEFAULT ARRAY[]::"StudyYear"[],

    CONSTRAINT "PocDiscordRole_pkey" PRIMARY KEY ("pocId","roleId")
);

ALTER TABLE "PocDiscordRole" ADD CONSTRAINT "PocDiscordRole_pocId_fkey" FOREIGN KEY ("pocId") REFERENCES "Poc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PocDiscordRole" ("pocId", "roleId")
SELECT "id", "discordRoleId" FROM "Poc" WHERE "discordRoleId" IS NOT NULL;

ALTER TABLE "Poc" DROP COLUMN "discordRoleId";
