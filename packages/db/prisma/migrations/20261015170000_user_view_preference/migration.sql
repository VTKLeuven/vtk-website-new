-- De weergave die iemand koos op een beheerscherm met meer dan één weergave
-- (/admin/bestuursorgaan: verkenner of lijst). Nieuwe tabel, dus geen bestaande
-- rijen: wie nog niets koos, krijgt de standaard van het scherm.

-- CreateTable
CREATE TABLE "UserViewPreference" (
    "userId" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserViewPreference_pkey" PRIMARY KEY ("userId","screen")
);

-- AddForeignKey
ALTER TABLE "UserViewPreference" ADD CONSTRAINT "UserViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

