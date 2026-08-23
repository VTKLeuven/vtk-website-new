-- Bestaande evenementen stonden al online en moeten na deze migratie online
-- blijven. Nieuwe evenementen krijgen bewust geen database-default: de admin-
-- action beslist expliciet of ze als concept of gepubliceerd worden opgeslagen.
ALTER TABLE "CalendarEvent" ADD COLUMN "publishedAt" TIMESTAMPTZ(3);

UPDATE "CalendarEvent"
SET "publishedAt" = CURRENT_TIMESTAMP;

-- Kalendercategorieën werden oorspronkelijk alleen door de seed aangemaakt,
-- maar de seed draait bewust niet bij een gewone deploy. Daardoor bleef de
-- event-editor op bestaande omgevingen zonder keuzes achter. Vul enkel
-- ontbrekende slugs aan; bestaande, admin-beheerde namen/kleuren/volgordes
-- worden niet overschreven.
INSERT INTO "CalendarCategory"
  ("id", "slug", "nameNl", "nameEn", "colour", "order", "audience", "showOnCalendarPage", "createdAt", "updatedAt")
VALUES
  ('calendar-category-eerstejaars', 'eerstejaars', 'Eerstejaars', 'First years', '#EC4899', 0, 'FIRST_YEARS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-internationaal', 'internationaal', 'Internationaal', 'International', '#14B8A6', 1, 'INTERNATIONALS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-career', 'career', 'Career', 'Career', '#0EA5E9', 2, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-cantus', 'cantus', 'Cantus', 'Cantus', '#E11D48', 3, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-cultuur', 'cultuur', 'Cultuur', 'Culture', '#D946EF', 4, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-sport', 'sport', 'Sport', 'Sports', '#16A34A', 5, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-service', 'service', 'Service', 'Service', '#F59E0B', 6, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-studie', 'studie', 'Studie', 'Studies', '#8B5CF6', 7, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
