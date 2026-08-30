-- "Student" wordt een expliciete profielstatus. Tot nu toe werd die afgeleid
-- uit het ontbreken van `notStudying`, waardoor alumni en andere niet-studenten
-- toch elk academiejaar door de studiebevestigingsgate gingen.
CREATE TYPE "AcademicStaffRole" AS ENUM ('PROFESSOR', 'ASSISTANT', 'ADMINISTRATIVE', 'OTHER');

ALTER TABLE "User"
  ADD COLUMN "isStudent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "academicStaffRole" "AcademicStaffRole";

-- Bestaande expliciete niet-studenten, alumni en zelf geregistreerde externe
-- accounts zijn geen student tot ze dat zelf opnieuw aanvinken in hun profiel.
UPDATE "User"
SET "isStudent" = false
WHERE "notStudying" = true
   OR "alumni" = true
   OR "selfRegisteredAt" IS NOT NULL;

-- Alumni hebben voortaan hun eigen status; `notStudying` blijft voor wie geen
-- student én geen alumnus is. Zo toont het nieuwe formulier geen dubbel vinkje.
UPDATE "User"
SET "notStudying" = false
WHERE "alumni" = true;

-- Zelf geregistreerde externe accounts die geen alumnus zijn, krijgen de
-- vierde status als voorselectie. Zo heeft ook een bestaand account na de
-- migratie minstens één geldige status in het nieuwe formulier.
UPDATE "User"
SET "notStudying" = true
WHERE "selfRegisteredAt" IS NOT NULL
  AND "alumni" = false;

-- Bij een e-mail/wachtwoordaccount is het loginadres het persoonlijke adres.
-- De onboarding vraagt daarom geen kunstmatige keuze "universiteit/persoonlijk".
UPDATE "User"
SET "emailPreference" = 'PERSONAL'
WHERE "selfRegisteredAt" IS NOT NULL;
