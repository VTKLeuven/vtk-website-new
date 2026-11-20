-- Een OAuth-client kan een KU Leuven-login vragen (gekoppeld of student).
-- Bestaande clients krijgen NONE en gedragen zich dus exact zoals voorheen.
CREATE TYPE "SsoKulRequirement" AS ENUM ('NONE', 'LINKED', 'STUDENT');

ALTER TABLE "oauthClient"
ADD COLUMN "kulRequirement" "SsoKulRequirement" NOT NULL DEFAULT 'NONE';

-- Bestaande leden: kulStudent false en kulStudentChangedAt NULL, wat "nog niet
-- gecontroleerd" betekent en niet "geen student". Er valt niets te backfillen:
-- het e-mailadres van de KU Leuven-login staat nergens bewaard. Een lid dat bij
-- een client met STUDENT tegenhoudt, krijgt op /inloggen/geen-toegang een knop
-- om eenmaal via KU Leuven aan te melden, en die login zet beide velden.
ALTER TABLE "User"
ADD COLUMN "kulStudent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "kulStudentChangedAt" TIMESTAMP(3);
