-- De versie van de lezer waarmee de bedragen van een BO-bestand gelezen werden
-- (`FIGURES_VERSION` in apps/web/lib/bo/figures.ts). Bestaande rijen krijgen 0:
-- ze werden met een oudere lezer gelezen, dus de volgende scan leest ze opnieuw.
-- Dat is de bedoeling: de fix voor een kostenpost "Totaal" (IT Nieuw Materiaal)
-- bereikte de bladen die sindsdien niet meer wijzigden nooit.
ALTER TABLE "BoDocument" ADD COLUMN "figuresVersion" INTEGER NOT NULL DEFAULT 0;
