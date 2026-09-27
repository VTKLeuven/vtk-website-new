-- Richting Mobility & Supply Chain (enkel een master). Bestaande leden houden
-- hun richtingen; er komt enkel een keuze bij. De Brevo-sync maakt het
-- bijhorende attribuut en de Career-deellijst "Masters" zelf aan, want de
-- opgeslagen lijstmapping is onvolledig zodra er een lijstsleutel bijkomt.
ALTER TYPE "StudyProgramme" ADD VALUE IF NOT EXISTS 'MOBILITY_SUPPLY_CHAIN' AFTER 'MATERIALS';
