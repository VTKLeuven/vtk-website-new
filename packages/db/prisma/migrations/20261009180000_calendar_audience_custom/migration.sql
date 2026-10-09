-- Een doelgroep zonder koppeling met het profiel (bv. de masterstudenten van één
-- richting): een label op het evenement, zonder regel die bepaalt wie erbij
-- hoort.
--
-- Bestaande doelgroepen: geen enkele verandert, want er komt enkel een
-- enumwaarde bij. Eerstejaars, internationals, laatstejaars en alumni blijven
-- aan hun profielregel hangen.
ALTER TYPE "CalendarAudience" ADD VALUE IF NOT EXISTS 'CUSTOM';
