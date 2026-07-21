/**
 * Eenmalige import van "Inventaris Loods.xlsx" naar de uitleendienst-catalogus.
 *
 * Gebruik:
 *   npm run import:inventaris -w @vtk/logistiek -- "<pad>/Inventaris Loods.xlsx"
 *   (optioneel: --materiaal-only of --flesserke-only)
 *
 * Idempotent: upsert op (naam + categorie); niets wordt verwijderd. Niet-numerieke
 * hoeveelheden ("Bak met losse sleutels") worden aantal 1 + de tekst in de
 * beschrijving. Gereserveerd/Beschikbaar uit de sheet worden genegeerd (live
 * berekend). Draai twee keer om de idempotentie te bevestigen (2de run: 0 nieuw).
 */
import { readFile, utils, type WorkBook, type WorkSheet } from 'xlsx';
import { prisma } from '@vtk/db';

type Row = Record<string, unknown>;

function cell(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
    if (found != null && row[found] != null && String(row[found]).trim() !== '') {
      return String(row[found]).trim();
    }
  }
  return '';
}

function normalizeCategory(raw: string): string {
  const t = raw.trim();
  if (!t) return 'Overig';
  const map: Record<string, string> = {
    'veiligheid&signalisatie': 'Veiligheid & signalisatie',
    'licht & geluid': 'Licht & geluid',
    werkmateriaal: 'Werkmateriaal',
    decoratie: 'Decoratie',
    allerlei: 'Allerlei',
    'banners & vlaggen': 'Banners & vlaggen',
    kuisproducten: 'Kuisproducten',
    verkleedkleren: 'Verkleedkleren',
    wegwerp: 'Wegwerp',
  };
  return map[t.toLowerCase()] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

const CONDITIONS = ['WERKT', 'KAPOT', 'TESTEN', 'ONVOLLEDIG'] as const;
type Condition = (typeof CONDITIONS)[number];

function parseCondition(raw: string): Condition {
  const t = raw.toLowerCase();
  if (t.includes('kapot') || t.includes('vervang')) return 'KAPOT';
  if (t.includes('test')) return 'TESTEN';
  if (t.includes('onvolledig')) return 'ONVOLLEDIG';
  return 'WERKT';
}

async function upsertCategory(name: string, cache: Map<string, string>): Promise<string> {
  const existingId = cache.get(name.toLowerCase());
  if (existingId) return existingId;
  const existing = await prisma.uitleenCategory.findFirst({ where: { name } });
  const id = existing
    ? existing.id
    : (await prisma.uitleenCategory.create({ data: { name, sortIndex: cache.size } })).id;
  cache.set(name.toLowerCase(), id);
  return id;
}

function sheetRows(wb: WorkBook, name: string): Row[] | null {
  const sheet: WorkSheet | undefined = wb.Sheets[name] ?? wb.Sheets[wb.SheetNames.find((n) => n.trim() === name) ?? ''];
  if (!sheet) return null;
  return utils.sheet_to_json<Row>(sheet, { defval: '' });
}

async function importMateriaal(wb: WorkBook): Promise<void> {
  // Het actuele materiaalblad heet "25-26 " (met spatie); val terug op varianten.
  const sheetName =
    wb.SheetNames.find((n) => /^25-?26/.test(n.trim())) ??
    wb.SheetNames.find((n) => n.toLowerCase().includes('materiaal')) ??
    wb.SheetNames[0];
  const rows = sheetRows(wb, sheetName);
  if (!rows) {
    console.warn(`Geen materiaalblad gevonden (${sheetName}).`);
    return;
  }

  const catCache = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = cell(row, 'Materiaal', '·', 'Naam');
    if (!name) {
      skipped += 1;
      continue;
    }
    const quantityRaw = cell(row, 'Hoeveelheid', 'Aantal');
    const numeric = Number.parseInt(quantityRaw.replace(',', '.'), 10);
    const quantity = Number.isInteger(numeric) && numeric > 0 ? numeric : 1;
    const description =
      Number.isInteger(numeric) && numeric > 0 ? null : quantityRaw ? `Hoeveelheid: ${quantityRaw}` : null;

    const categoryName = normalizeCategory(cell(row, 'Catalogus', 'Categorie'));
    const categoryId = await upsertCategory(categoryName, catCache);
    const condition = parseCondition(cell(row, 'Status'));
    const conditionNote = cell(row, 'Opmerking', 'Opmerkingen') || null;
    const locationShelf = cell(row, 'Schap') || null;
    const locationRack = cell(row, 'Rek') || null;

    const existing = await prisma.uitleenItem.findFirst({ where: { name, categoryId } });
    const data = {
      name,
      description,
      categoryId,
      quantity,
      condition,
      conditionNote,
      locationShelf,
      locationRack,
    };
    if (existing) {
      await prisma.uitleenItem.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.uitleenItem.create({ data });
      created += 1;
    }
  }

  console.log(`Materiaal (${sheetName}): ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen.`);
}

async function importFlesserke(wb: WorkBook): Promise<void> {
  const rows = sheetRows(wb, 'Flesserke');
  if (!rows) {
    console.warn('Geen Flesserke-blad gevonden.');
    return;
  }

  const catCache = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = cell(row, 'Wat?', 'Wat');
    if (!name) {
      skipped += 1;
      continue;
    }
    const quantity = Number.parseInt(cell(row, 'Aantal').replace(',', '.'), 10) || 0;
    const brand = cell(row, 'Merk') || null;
    const contentAmount = cell(row, 'Hoeveelheid [kg of L]', 'Hoeveelheid') || null;
    const categoryName = normalizeCategory(cell(row, 'Categorie'));
    const opmerking = cell(row, 'Opmerkingen/ Link', 'Opmerkingen', 'Opmerking');
    const colruytUrl = opmerking.startsWith('http') ? opmerking : null;
    const note = opmerking.startsWith('http') ? null : opmerking || null;
    const locationShelf = cell(row, 'Schap') || null;
    const locationRack = cell(row, 'Rek') || null;
    // Eerste vervaldatum: xlsx geeft met cellDates een Date; anders overslaan.
    const expiryRaw = row[Object.keys(row).find((k) => k.trim().toLowerCase().includes('vervaldatum')) ?? ''];
    const expiryDate = expiryRaw instanceof Date && !Number.isNaN(expiryRaw.getTime()) ? expiryRaw : null;

    let categoryId = catCache.get(categoryName.toLowerCase());
    if (!categoryId) {
      const found = await prisma.uitleenFlesserkeCategory.findFirst({ where: { name: categoryName } });
      categoryId = found
        ? found.id
        : (await prisma.uitleenFlesserkeCategory.create({ data: { name: categoryName, sortIndex: catCache.size } })).id;
      catCache.set(categoryName.toLowerCase(), categoryId);
    }

    const existing = await prisma.uitleenFlesserkeItem.findFirst({ where: { name, categoryId } });
    const data = { name, brand, contentAmount, categoryId, quantity, expiryDate, colruytUrl, note, locationShelf, locationRack };
    if (existing) {
      await prisma.uitleenFlesserkeItem.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.uitleenFlesserkeItem.create({ data });
      created += 1;
    }
  }

  console.log(`Flesserke: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen.`);
}

async function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error('Geef het pad naar het xlsx-bestand mee.');
    process.exit(1);
  }
  const onlyFlesserke = args.includes('--flesserke-only');
  const onlyMateriaal = args.includes('--materiaal-only');

  const wb = readFile(path, { cellDates: true });
  if (!onlyFlesserke) await importMateriaal(wb);
  if (!onlyMateriaal) await importFlesserke(wb);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
