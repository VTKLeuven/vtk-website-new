-- De aanbod-kaarten op de homepage ("Wat we doen") droegen allemaal dezelfde
-- hardgecodeerde zin. Redacteuren kunnen die tekst voortaan per werking zetten
-- via /admin/home; leeg blijft de standaardzin uit lib/aanbodCards.ts.
ALTER TABLE "HeaderTab"
  ADD COLUMN "homeBodyNl" TEXT,
  ADD COLUMN "homeBodyEn" TEXT;
