-- Autoritatieve faculteitsstatus uit KU Leuven OIDC. Bestaande accounts starten
-- met false en een lege wijzigingsdatum; hun eerstvolgende geslaagde KU Leuven-
-- userinfo-call initialiseert beide velden. Daarna verandert de datum enkel
-- wanneer firwStudent effectief van waarde wisselt.
ALTER TABLE "User"
ADD COLUMN "firwStudent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "firwStudentChangedAt" TIMESTAMP(3);
