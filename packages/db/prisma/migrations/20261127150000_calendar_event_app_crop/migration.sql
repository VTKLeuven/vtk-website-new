-- Een eigen uitsnede voor de eventfoto in de app: middelpunt, zoom en de
-- verhouding van de foto waarvoor ze gekozen is (nodig om uit te zoomen).
-- Bestaande evenementen krijgen NULL, en dat is "volgt de telefoonuitsnede, en
-- anders het middelpunt": al beter dan wat de app vandaag toont (altijd het
-- midden), en voor niemand een verslechtering.
ALTER TABLE "CalendarEvent" ADD COLUMN "imageFocusAppX" DOUBLE PRECISION;
ALTER TABLE "CalendarEvent" ADD COLUMN "imageFocusAppY" DOUBLE PRECISION;
ALTER TABLE "CalendarEvent" ADD COLUMN "imageZoomApp" DOUBLE PRECISION;
ALTER TABLE "CalendarEvent" ADD COLUMN "imageRatioApp" DOUBLE PRECISION;
