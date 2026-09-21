-- Het broodje van de week is het aanbod-item met de markering `isWeeklySpecial`;
-- de naam van dat item is wat het die week concreet is. Deze twee kolommen
-- werden daardoor al een tijd nergens meer gelezen of geschreven.
ALTER TABLE "TheokotSession" DROP COLUMN "weeklySpecialLabelNl";
ALTER TABLE "TheokotSession" DROP COLUMN "weeklySpecialLabelEn";
