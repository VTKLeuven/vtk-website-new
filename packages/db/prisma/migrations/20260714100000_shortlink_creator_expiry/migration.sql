-- Add optional expiry to short links and a real FK to the creating user.
ALTER TABLE "ShortLink" ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "ShortLink"
    ADD CONSTRAINT "ShortLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
