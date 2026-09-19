-- De e-mailhandtekening van een lid verhuist van localStorage naar het profiel,
-- zodat de mails van de lesbezoeken en de Theokot-verhuur ondertekend kunnen
-- worden door wie ze verstuurt. Alles optioneel: leeg valt terug op wat uit het
-- lid en zijn post afgeleid kan worden.
ALTER TABLE "User" ADD COLUMN "signatureName" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureRoleTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "signaturePhone" TEXT;
