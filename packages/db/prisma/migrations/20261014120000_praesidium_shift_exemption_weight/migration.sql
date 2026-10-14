-- Iemand voor een deel laten meetellen op een shiftenlijst van het praesidium
-- (logistiek telt op 24UL voor 50%). Tot nu toe betekende elke rij
-- "overgeslagen": de vakjes tellen niet en die persoon valt uit het gemiddelde
-- van die lijst. Dat is een gewicht van 0, dus met de default 0 blijft elke
-- bestaande rij precies wat ze was; er is geen backfill nodig.

-- AlterTable
ALTER TABLE "PraesidiumShiftExemption" ADD COLUMN "weight" DOUBLE PRECISION NOT NULL DEFAULT 0;
