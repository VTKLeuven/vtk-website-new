-- Vastgepinde admin-tabs per gebruiker.
CREATE TABLE "UserAdminNavPin" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserAdminNavPin_pkey" PRIMARY KEY ("userId","key")
);

CREATE INDEX "UserAdminNavPin_userId_idx" ON "UserAdminNavPin"("userId");

ALTER TABLE "UserAdminNavPin" ADD CONSTRAINT "UserAdminNavPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
