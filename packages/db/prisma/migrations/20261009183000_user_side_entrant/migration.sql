-- Zij-instromer als vraag in het studieprofiel, en de bijhorende doelgroep in de
-- kalender.
--
-- Bestaande leden krijgen `false`: niemand heeft het ooit kunnen aanduiden, dus
-- dat betekent "niet aangeduid", niet "geen zij-instromer". Wie het is, vinkt
-- het aan op /account of bij de jaarlijkse studiebevestiging. Bestaande
-- doelgroepen veranderen niet; er komt enkel een enumwaarde bij.
ALTER TYPE "CalendarAudience" ADD VALUE IF NOT EXISTS 'SIDE_ENTRANTS';

ALTER TABLE "User" ADD COLUMN "sideEntrant" BOOLEAN NOT NULL DEFAULT false;
