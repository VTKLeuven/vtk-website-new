-- Een eigen herkomst voor Career dat zonder scherm aangezet werd. In een aparte
-- migratie: Postgres laat een nieuwe enumwaarde niet gebruiken in dezelfde
-- transactie die ze toevoegt, en de volgende migratie gebruikt ze.
ALTER TYPE "CareerOptInSource" ADD VALUE IF NOT EXISTS 'DEFAULT';
