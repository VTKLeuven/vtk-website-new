-- Welke evenementen uitgelicht staan bij de affiches in de hero van de homepage.
-- Bestaande evenementen krijgen NULL: niets is uitgelicht, en de hero toont dan
-- gewoon de eerstvolgende vier.
ALTER TABLE "CalendarEvent" ADD COLUMN "homeFeaturedAt" TIMESTAMPTZ(3);
