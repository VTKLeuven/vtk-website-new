-- Werkingsjaar-historiek voor posten (groepen).
--
-- 1) Backfill: bestaande memberships zonder jaar horen bij het eerste getrackte
--    werkingsjaar 2026 (= "26-27"). Zo verschijnen de huidige leden onder dat
--    tabje en blijven latere jaren automatisch leeg tot ze ingevuld worden.
UPDATE "GroupMembership" SET "year" = 2026 WHERE "year" IS NULL;

-- 2) Jaar wordt verplicht.
ALTER TABLE "GroupMembership" ALTER COLUMN "year" SET NOT NULL;

-- 3) Uniek per (user, post, jaar) i.p.v. per (user, post), zodat iemand in
--    meerdere jaren in dezelfde post kan zitten.
DROP INDEX "GroupMembership_userId_groupId_key";
CREATE UNIQUE INDEX "GroupMembership_userId_groupId_year_key" ON "GroupMembership"("userId", "groupId", "year");
CREATE INDEX "GroupMembership_year_idx" ON "GroupMembership"("year");

-- 4) De 'Algemeen'-post hoort niet in de praesidiumstructuur. Verwijderen; FK's
--    (memberships, events, dashboard tiles) cascaden mee.
DELETE FROM "Group" WHERE "code" = 'ALGEMEEN';
