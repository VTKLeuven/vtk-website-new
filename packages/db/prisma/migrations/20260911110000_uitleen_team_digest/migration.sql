-- De meldingsmail naar het team vertrekt niet meer bij het indienen maar
-- hoogstens één keer per uur, gebundeld. `teamNotifiedAt IS NULL` is de
-- wachtrij; zie de comments in schema.prisma en `sendTeamDigests`.
ALTER TABLE "UitleenTransportBooking" ADD COLUMN "teamNotifiedAt" TIMESTAMP(3);
ALTER TABLE "UitleenReservation" ADD COLUMN "teamNotifiedAt" TIMESTAMP(3);

-- Alles wat er al staat, geldt als gemeld. Zonder deze backfill stuurt de eerste
-- tick na de deploy elke aanvraag die er ooit geweest is nog eens door.
UPDATE "UitleenTransportBooking" SET "teamNotifiedAt" = "createdAt";
UPDATE "UitleenReservation" SET "teamNotifiedAt" = "createdAt";

-- De wachtrij wordt elke minuut afgetast; zonder index is dat elke minuut een
-- seq scan over alle ritten en aanvragen.
CREATE INDEX "UitleenTransportBooking_teamNotifiedAt_idx" ON "UitleenTransportBooking"("teamNotifiedAt");
CREATE INDEX "UitleenReservation_teamNotifiedAt_idx" ON "UitleenReservation"("teamNotifiedAt");
