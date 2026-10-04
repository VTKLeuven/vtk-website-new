-- Optionele ronde sticker / badge per broodje (PNG met transparantie).
-- Wordt getoond aan de afhaalbalie zodat shifters het broodje direct
-- visueel kunnen herkennen tussen de fysieke broodjes met stickers.
ALTER TABLE "TheokotProduct" ADD COLUMN "badgeImageKey" TEXT;
ALTER TABLE "TheokotSessionItem" ADD COLUMN "badgeImageKey" TEXT;
