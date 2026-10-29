-- De hero bovenaan de homepage is weg, en daarmee alles wat er enkel voor
-- bestond: de tabel met de frontpages (standaard, 24 urenloop, jobfair), de
-- plaatsing van een evenement in het weekoverzicht van de hero, de mail aan de
-- post wanneer een concept in dat overzicht kwam, de permissie om dat overzicht
-- samen te stellen en de lijst slogans. Geen code leest dit nog.

-- Weekoverzicht van de hero
DROP INDEX IF EXISTS "CalendarEvent_heroWeekNoticeAt_start_idx";
ALTER TABLE "CalendarEvent" DROP COLUMN IF EXISTS "heroWeek";
ALTER TABLE "CalendarEvent" DROP COLUMN IF EXISTS "heroWeekNoticeAt";
DROP TYPE IF EXISTS "HeroWeekPlacement";

-- Frontpages
DROP TABLE IF EXISTS "Frontpage";

-- De permissie; haar RolePermission-rijen gaan mee via de cascade.
DELETE FROM "Permission" WHERE "code" = 'calendar.heroWeek';

-- De slogans van de titel
DELETE FROM "Setting" WHERE "key" = 'home.slogans';
