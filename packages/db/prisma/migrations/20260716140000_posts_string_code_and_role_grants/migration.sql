-- Step 4 (roles & permissions rework): posten worden GUI-dynamisch en verlenen
-- rollen i.p.v. losse rechten. Destructief op de prototype-DB (de legacy
-- GroupPermission-rijen worden weggegooid; ze zijn herbouwd als rol-grants in de seed).

-- Group.code: GroupCode-enum -> vrije unieke string. USING behoudt de bestaande waarden.
ALTER TABLE "Group" ALTER COLUMN "code" TYPE TEXT USING "code"::text;

-- Shift.post: GroupCode?-enum -> string (opgeslagen postcode, geen relatie).
ALTER TABLE "Shift" ALTER COLUMN "post" TYPE TEXT USING "post"::text;

-- Nieuwe kolom: een post kan gedeactiveerd worden (historiek blijft) i.p.v. verwijderd.
ALTER TABLE "Group" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Legacy: directe rechten op een post. Vervangen door rol-grants (GroupRole).
DROP TABLE "GroupPermission";

-- De GroupCode-enum wordt nergens meer gebruikt.
DROP TYPE "GroupCode";
