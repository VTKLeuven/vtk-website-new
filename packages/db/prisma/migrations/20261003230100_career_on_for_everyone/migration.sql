-- Career staat vanaf nu standaard aan: eenmalig voor elk bestaand account dat
-- het niet aan had. Wie het daarna uitzet (/account) of zich in Brevo uitschrijft, valt
-- er weer uit en wordt niet opnieuw toegevoegd.
--
-- Wat dit niet raakt:
-- - `mailUnsubscribedAt` (de uitschrijflink onderaan elke mail, die alle
--   lijstmail stopt): die blijft staan, dus wie zo uitschreef, krijgt nog altijd
--   geen lijstmail.
-- - Een uitschrijving voor Career in Brevo zelf: de sync leest die terug voor ze
--   schrijft, en zet Career bij die leden dan weer uit.
UPDATE "User"
SET
  "mailCategories" = array_append("mailCategories", 'CAREER'::"MailCategory"),
  "careerOptInAt" = NOW(),
  "careerOptInSource" = 'DEFAULT'
WHERE NOT ('CAREER'::"MailCategory" = ANY("mailCategories"))
  -- Een verwijderd account is geanonimiseerd en hoort in geen enkele lijst.
  AND "deletedAt" IS NULL;
