-- AlterTable
-- Bewust zonder backfill: iedereen start als "niet bevestigd" en declareert bij
-- de eerstvolgende login opnieuw wat hij studeert. Dat is precies het jaarlijkse
-- signaal dat vroeger via de cursusdienst binnenkwam. Gevolg: tot leden
-- bevestigen zijn de mailinglijst-exports leeg.
ALTER TABLE "User" ADD COLUMN     "studyConfirmedYear" INTEGER;
