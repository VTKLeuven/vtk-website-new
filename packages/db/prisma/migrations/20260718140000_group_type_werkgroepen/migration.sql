-- Werkgroepen zijn een tweede soort Group naast de praesidiumposten: dezelfde
-- leden/rollen-machinerie (GroupMembership + GroupRole), maar niet op
-- /praesidium. Ze krijgen /werkgroepen met een eigen infotekst (description*,
-- bewerkbaar door de leden zelf) en een optionele website. Bestaande groepen
-- zijn allemaal praesidiumposten, vandaar de default.
CREATE TYPE "GroupType" AS ENUM ('PRAESIDIUM', 'WERKGROEP');

ALTER TABLE "Group" ADD COLUMN "type" "GroupType" NOT NULL DEFAULT 'PRAESIDIUM';
ALTER TABLE "Group" ADD COLUMN "website" TEXT;
