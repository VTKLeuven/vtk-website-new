-- Voorrang of uitsluiting van een evenement in het weekoverzicht op de homepage.
-- Zie apps/web/lib/calendar/heroWeek.ts; raakt enkel de hero, niet de kalender
-- zelf, de feeds of de app.
CREATE TYPE "HeroWeekPlacement" AS ENUM ('AUTO', 'PINNED', 'HIDDEN');

ALTER TABLE "CalendarEvent"
  ADD COLUMN "heroWeek" "HeroWeekPlacement" NOT NULL DEFAULT 'AUTO';
