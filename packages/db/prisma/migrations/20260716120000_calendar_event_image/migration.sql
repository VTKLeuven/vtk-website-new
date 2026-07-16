-- Optional cover image for a calendar event. Stored as a storage key (like
-- Partner.logoKey); the event page falls back to the default image when null.
ALTER TABLE "CalendarEvent" ADD COLUMN "imageKey" TEXT;
