-- De hero wordt enkel nog in /admin/home gekozen. /admin/frontpage en /admin/slogans
-- zijn weg, en daarmee de tabel en de instelling die ze beheerden: de teksten van de
-- oude hero, de 24 urenloop en de jobfair staan vast in de code. De keuze zelf
-- staat in de instelling `home.heroDesign` en blijft staan.
DROP TABLE IF EXISTS "Frontpage";

DELETE FROM "Setting" WHERE "key" = 'home.slogans';
