-- Twee extra velden op een shift, allebei optioneel voor bestaande rijen:
--   openToInternationals: de shift kan zonder Nederlands gedaan worden en krijgt
--     daarom de markering "Ook voor internationals" op /shift. Bestaande shiften
--     starten op false; een verantwoordelijke vinkt aan waar het klopt.
--   instructions: langere uitleg (Markdown) over wat de shift inhoudt, los van
--     de korte description. NULL = de frontend toont het uitlegblok niet.
ALTER TABLE "Shift"
ADD COLUMN "openToInternationals" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "instructions" TEXT;
