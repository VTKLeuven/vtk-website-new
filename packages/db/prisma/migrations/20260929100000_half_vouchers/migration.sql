-- Een broodje aan de afhaalbalie kost voortaan een half bonnetje per 60 cent
-- (instelbaar in `theokot.config`), dus het uitbetaalde deel van een shift en
-- een afboeking aan de balie kunnen op een half eindigen.
--
-- Bestaande rijen veranderen niet van waarde: een geheel getal is exact als
-- double. Afboekingen van voor deze wijziging blijven op 2 staan, want dat is
-- wat ze toen kostten. De default van 2 op `amount` verdwijnt: de balie zet het
-- bedrag altijd zelf, en een vaste twee is niet meer de prijs.
ALTER TABLE "ShiftParticipant" ALTER COLUMN "rewardPaid" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "TheokotVoucherRedemption" ALTER COLUMN "amount" DROP DEFAULT,
ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION;
