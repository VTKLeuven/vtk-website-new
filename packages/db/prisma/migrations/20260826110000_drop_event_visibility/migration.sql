-- Alle evenementen zijn publiek.
--
-- `EventVisibility.MEMBERS` bestond om een evenement enkel aan ingelogde leden
-- te tonen, maar VTK plant niets in wat niet op de publieke kalender mag staan;
-- wat wél besloten is (een vergadering, een intern moment) staat nergens in deze
-- tabel. De vlag zorgde vooral voor een extra regel in elke query en voor een
-- keuzelijst in de admin die niemand ooit anders zette.
--
-- Wie een evenement niet online wil, zet het op concept (`publishedAt IS NULL`);
-- dat is sinds deze release ook terug te draaien vanaf een gepubliceerd event.

ALTER TABLE "CalendarEvent" DROP COLUMN "visibility";

DROP TYPE "EventVisibility";
