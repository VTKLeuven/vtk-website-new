-- Het bereik van een aankondiging. Tot nu toe verscheen ze enkel op de homepage,
-- waardoor iedereen die via Google of een gedeelde link op een andere pagina
-- binnenkomt het bericht nooit zag. HOME is de standaard, zodat bestaande
-- aankondigingen zich blijven gedragen zoals ze bedoeld waren.
CREATE TYPE "AnnouncementScope" AS ENUM ('HOME', 'SITE');

ALTER TABLE "Announcement"
  ADD COLUMN "scope" "AnnouncementScope" NOT NULL DEFAULT 'HOME';
