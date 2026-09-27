-- Tickettypes voor een doelgroep (eerstejaars, laatstejaars, internationals,
-- alumni) en de herkomst van een bestelling, voor de ticketstatistieken.
--
-- Bestaande rijen: geen enkel tickettype verandert van doelgroep, want er komen
-- enkel enumwaarden bij. Bestaande bestellingen krijgen `source` en
-- `sourceCampaign` NULL: hun herkomst is nooit gemeten en valt ook niet meer te
-- achterhalen. De statistieken tonen ze als "niet gemeten", niet als "direct".

ALTER TYPE "TicketAudience" ADD VALUE IF NOT EXISTS 'FIRST_YEARS';
ALTER TYPE "TicketAudience" ADD VALUE IF NOT EXISTS 'LAST_YEARS';
ALTER TYPE "TicketAudience" ADD VALUE IF NOT EXISTS 'INTERNATIONALS';
ALTER TYPE "TicketAudience" ADD VALUE IF NOT EXISTS 'ALUMNI';

ALTER TABLE "TicketOrder" ADD COLUMN "source" TEXT;
ALTER TABLE "TicketOrder" ADD COLUMN "sourceCampaign" TEXT;
