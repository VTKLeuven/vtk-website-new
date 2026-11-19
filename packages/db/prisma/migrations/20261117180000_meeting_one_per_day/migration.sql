-- Eén vergadering per soort per dag (de Brusselse kalenderdag): een bureau en
-- een grocomeet mogen dezelfde dag vallen, twee bureaus niet. Op productie
-- stond elk bureau van het eerste semester 2026-27 dubbel: op 6 september zette
-- de planning van semester 2 de zeven dagen van semester 1 er een tweede keer
-- in (slug `-2`, `semester` 2, geen inschrijvingen). De planner hield na het
-- wisselen van semestertab de dagen van het vorige semester vast, onzichtbaar
-- omdat ze buiten de getoonde maanden vielen, en niets hield dat tegen. De code ging er al van uit dat er per dag één is (de koppeling
-- van Theokot-bestellingen aan "de" grocomeet van die dag).
--
-- Wat er met bestaande rijen gebeurt:
-- * `day` wordt ingevuld uit `startsAt`, en een trigger houdt het daarna bij.
--   De code schrijft het nergens zelf.
-- * Twee of meer op dezelfde dag worden samengevoegd in de oudste
--   (`createdAt`): die heeft de gewone link (`bureau-2026-11-19`, zonder -2),
--   en die stond dus in de mails. Zijn uur, plaats, aanbod en instellingen
--   blijven; die van de dubbels verdwijnen.
-- * Een inschrijving verhuist naar de oudste. Stond iemand op beide, dan blijft
--   zijn laatst bijgewerkte keuze, met de herkomst en het tijdstip van zijn
--   eerste inschrijving (de eerste inschrijving wint, zoals in de app). Een
--   keuze uit het eigen aanbod van een dubbel verliest de koppeling naar die
--   optie; de naam en prijs van het broodje staan op de inschrijving zelf.
-- * Reclamemomenten en de Theokot-bestellingen van een grocomeet verhuizen mee.

ALTER TABLE "Meeting" ADD COLUMN "day" DATE NOT NULL DEFAULT CURRENT_DATE;
UPDATE "Meeting" SET "day" = ("startsAt" AT TIME ZONE 'Europe/Brussels')::date;

CREATE TEMP TABLE meeting_merge AS
SELECT m.id AS dup_id, keeper.id AS keeper_id
FROM "Meeting" m
JOIN LATERAL (
  SELECT k.id FROM "Meeting" k
  WHERE k.kind = m.kind AND k."day" = m."day"
  ORDER BY k."createdAt", k.id
  LIMIT 1
) keeper ON true
WHERE m.id <> keeper.id;

CREATE TEMP TABLE reservation_group AS
SELECT r.id, r."userId", COALESCE(mm.keeper_id, r."meetingId") AS keeper_id,
       r."createdAt", r."updatedAt", r.source, r."sourceCampaign"
FROM "MeetingReservation" r
LEFT JOIN meeting_merge mm ON mm.dup_id = r."meetingId"
WHERE r."meetingId" IN (SELECT dup_id FROM meeting_merge UNION SELECT keeper_id FROM meeting_merge);

CREATE TEMP TABLE reservation_survivor AS
SELECT DISTINCT ON (keeper_id, "userId") keeper_id, "userId", id
FROM reservation_group
ORDER BY keeper_id, "userId", "updatedAt" DESC, id;

CREATE TEMP TABLE reservation_first AS
SELECT DISTINCT ON (keeper_id, "userId") keeper_id, "userId", "createdAt", source, "sourceCampaign"
FROM reservation_group
ORDER BY keeper_id, "userId", "createdAt", id;

DELETE FROM "MeetingReservation"
WHERE id IN (SELECT id FROM reservation_group)
  AND id NOT IN (SELECT id FROM reservation_survivor);

UPDATE "MeetingReservation" r
SET "meetingId" = s.keeper_id,
    "createdAt" = f."createdAt",
    source = f.source,
    "sourceCampaign" = f."sourceCampaign",
    "optionId" = (
      SELECT o.id FROM "MeetingOption" o WHERE o.id = r."optionId" AND o."meetingId" = s.keeper_id
    )
FROM reservation_survivor s
JOIN reservation_first f ON f.keeper_id = s.keeper_id AND f."userId" = s."userId"
WHERE r.id = s.id;

UPDATE "MeetingPromotion" p SET "meetingId" = mm.keeper_id
FROM meeting_merge mm WHERE p."meetingId" = mm.dup_id;

UPDATE "TheokotOrder" o SET "grocomeetId" = mm.keeper_id
FROM meeting_merge mm WHERE o."grocomeetId" = mm.dup_id;

DELETE FROM "Meeting" WHERE id IN (SELECT dup_id FROM meeting_merge);

DROP TABLE reservation_first;
DROP TABLE reservation_survivor;
DROP TABLE reservation_group;
DROP TABLE meeting_merge;

-- `day` volgt `startsAt` bij elke schrijfactie, ook een verplaatsing.
CREATE FUNCTION "meeting_set_day"() RETURNS trigger AS $$
BEGIN
  NEW."day" := (NEW."startsAt" AT TIME ZONE 'Europe/Brussels')::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "meeting_set_day"
BEFORE INSERT OR UPDATE OF "startsAt" ON "Meeting"
FOR EACH ROW EXECUTE FUNCTION "meeting_set_day"();

CREATE UNIQUE INDEX "Meeting_kind_day_key" ON "Meeting"("kind", "day");
