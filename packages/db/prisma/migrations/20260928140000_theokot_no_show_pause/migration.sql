-- No-shows die niet meetellen voor een ban, en geen mail krijgen zolang die
-- nog niet vertrokken was: omdat de verwerking gepauzeerd stond, of omdat de
-- verkoopdag als "er liep iets mis" aangeduid werd.
--
-- Bestaande bestellingen en dagen krijgen NULL, en dat is voor hen juist: ze
-- zijn gewoon verwerkt, met mail en telling.
ALTER TABLE "TheokotOrder" ADD COLUMN "noShowWaivedAt" TIMESTAMPTZ(3);
ALTER TABLE "TheokotSession" ADD COLUMN "noShowsWaivedAt" TIMESTAMPTZ(3);
