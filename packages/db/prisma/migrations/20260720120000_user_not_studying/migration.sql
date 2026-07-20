-- Lid dat niet (meer) studeert (afgestudeerd of gestopt). Los van notAtFaculty:
-- wie dit aanduidt valt uit élke studiegerichte mailinglijst.
ALTER TABLE "User" ADD COLUMN "notStudying" BOOLEAN NOT NULL DEFAULT false;
