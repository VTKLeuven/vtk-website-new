-- Een eigen uitsnede voor de eventfoto op een telefoon: middelpunt, zoom en de
-- verhouding van de foto waarvoor ze gekozen is (nodig om uit te zoomen).
-- Bestaande evenementen krijgen NULL, en dat is "volgt de uitsnede van op een
-- groot scherm, zonder zoom": precies wat ze vandaag tonen.
ALTER TABLE "CalendarEvent" ADD COLUMN "imageFocusMobileX" DOUBLE PRECISION;
ALTER TABLE "CalendarEvent" ADD COLUMN "imageFocusMobileY" DOUBLE PRECISION;
ALTER TABLE "CalendarEvent" ADD COLUMN "imageZoomMobile" DOUBLE PRECISION;
ALTER TABLE "CalendarEvent" ADD COLUMN "imageRatioMobile" DOUBLE PRECISION;
