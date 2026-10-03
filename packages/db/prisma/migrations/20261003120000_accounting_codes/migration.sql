-- Boekhoudcodes: een ticketverkoop en het lidmaatschap kiezen er één, en die
-- gaat mee in de betaalinfo bij Mollie en Bancontact. Zie docs/ticketing.md.

-- CreateTable
CREATE TABLE "AccountingCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountingCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCode_code_key" ON "AccountingCode"("code");

-- CreateIndex
CREATE INDEX "AccountingCode_parentId_idx" ON "AccountingCode"("parentId");

-- AddForeignKey
ALTER TABLE "AccountingCode" ADD CONSTRAINT "AccountingCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountingCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bestaande events krijgen geen code: welke code bij welke verkoop hoort, is
-- een keuze van de penning en niet af te leiden. Ze blijven verkopen; wie het
-- event opslaat of opnieuw publiceert, moet er een kiezen.
ALTER TABLE "TicketEvent" ADD COLUMN "accountingCodeId" TEXT;

-- CreateIndex
CREATE INDEX "TicketEvent_accountingCodeId_idx" ON "TicketEvent"("accountingCodeId");

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bestaande bestellingen en lidgeldbetalingen blijven NULL, en dat is de
-- waarheid: hun betaalinfo droeg geen code. De statistieken tonen ze als
-- "zonder boekhoudcode", niet onder een code die er toen niet bij stond.
ALTER TABLE "TicketOrder" ADD COLUMN "accountingCode" TEXT,
ADD COLUMN "accountingCodeName" TEXT;

ALTER TABLE "MembershipPayment" ADD COLUMN "accountingCode" TEXT,
ADD COLUMN "accountingCodeName" TEXT;

-- De codes van het rekeningstelsel van de kring, zodat de keuzelijst meteen
-- gevuld is (ook in productie: de seed draait niet bij een deploy). Daarna
-- beheert de penning ze in /admin/boekhoudcodes. Een subcode is de code van de
-- hoofdrekening met vijf cijfers erachter.
INSERT INTO "AccountingCode" ("id", "code", "name", "updatedAt")
VALUES
    (gen_random_uuid()::text, '700000', 'Cursusdienst opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700010', 'Verkoop tweedehands boeken', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700100', 'Activiteiten opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700101', 'Onthaal opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700110', 'Cultuur opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700120', 'Internationaal opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700130', 'Alumni opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700140', 'Onderwijs opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700150', 'Sport opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700160', 'Theokot broodjesbar opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700161', 'Theokot randactiviteiten opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700170', 'Vice: interne relaties opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700180', 'Textiel opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700190', 'Galabal opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700200', 'Jaarwerking opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700210', 'WG evenementen opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700211', '24UL opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700220', 'WG Best opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700230', 'WG Ploeg 1 opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700240', 'Lolploegen en verkiezingsopbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700250', 'WG Existenz opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700260', 'WG Revue opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700270', 'WG Iaste opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700280', 'WG Statix opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700290', 'WG Mechanix opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700310', 'Project L opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700320', 'WG Chemix opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700330', 'WG Biomedix opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700340', 'Studentenwelkom opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '700350', 'Opbrengsten buitenlandse reizen', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '704000', 'Fakbar opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '704010', 'Fakbar drank opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '704100', 'Bedrijvenrelaties opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '730000', 'Lidgelden', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '732000', 'Sponsoring & subsidies', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '732010', 'Giften Barbarafonds', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '740000', 'Diverse recuperaties', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '740010', 'Opbrengsten voor goede doelen', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '740100', 'Logistiek opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '757000', 'Financiële opbrengsten', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '757100', 'Betalingsverschillen', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, '760000', 'Uitzonderlijke kosten', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "AccountingCode" ("id", "code", "name", "parentId", "updatedAt")
SELECT gen_random_uuid()::text, parent."code" || sub.suffix, sub.name, parent."id", CURRENT_TIMESTAMP
FROM (
    VALUES
        ('700000', '00001', 'Printer'),
        ('700100', '10001', 'Cantussen'),
        ('700100', '10002', 'TD''s'),
        ('700100', '10003', 'Partybus'),
        ('700100', '10004', 'Toernooitjes'),
        ('700100', '10005', 'Materiaal'),
        ('700101', '10001', 'Onthaaldagen'),
        ('700101', '10002', 'Startersdagen'),
        ('700101', '10003', 'PEME'),
        ('700110', '11001', 'Quiz'),
        ('700110', '11002', 'Kerstmarkt'),
        ('700110', '11003', 'IFR'),
        ('700110', '11004', 'Comedy Night'),
        ('700110', '11005', 'Heverlicht'),
        ('700120', '12001', 'Orientation Days'),
        ('700120', '12002', 'Cantussen'),
        ('700120', '12003', 'Feestjes'),
        ('700120', '12004', 'Go Global'),
        ('700120', '12005', 'Fiesta'),
        ('700140', '14001', 'PAL'),
        ('700140', '14002', 'Rivers'),
        ('700140', '14003', 'Bureaus'),
        ('700140', '14004', 'Kaas en Wijn'),
        ('700150', '15001', '24UL'),
        ('700190', '19001', 'Toog'),
        ('704100', '10001', 'BR Launch'),
        ('704100', '10002', 'Sector Nights'),
        ('704100', '10003', 'Internship Fair'),
        ('704100', '10004', 'Jobfair'),
        ('704100', '10005', 'ECC'),
        ('704100', '10006', 'Career'),
        ('704100', '10007', 'Workshops'),
        ('704100', '10008', 'VTK Spotlight'),
        ('704100', '10009', 'Development')
) AS sub (parent_code, suffix, name)
JOIN "AccountingCode" parent ON parent."code" = sub.parent_code
ON CONFLICT ("code") DO NOTHING;
