'use server';

import { prisma } from '@vtk/db';
import type { FakbarConsumptionCategory, FakbarItemCategory, FakbarSpecialKind } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { canManageFakbar, getSession } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import {
  CATEGORY_ORDER,
  CONSUMPTION_ORDER,
  DENOMINATIONS,
  VOUCHER_FIELDS,
  parseCount,
  parseEuroToCents,
} from '@/lib/fakbar-format';
import { fakbarWeekDays, fakbarWeekRange, isoWeeksInYear } from '@/lib/fakbar-week';
import { saveElixirHours, ELIXIR_DAYS } from '@/lib/opening-hours';
import { saveRentalSettings, type RentalSettings } from '@/lib/rental-settings';

/**
 * Elke actie hieronder begint met `requireFakbar()`.
 *
 * Dat is geen formaliteit. Een server action is een gewoon POST-endpoint met een
 * voorspelbare id: wie de bundel opent, kan ze aanroepen zonder ooit een
 * beheerscherm te openen. De layout van /admin controleert de rechten voor het
 * *tekenen* van het scherm, niet voor het *uitvoeren* van de actie. Deze
 * functies stonden er eerder zonder enige controle; iedereen op het internet kon
 * de kassatelling van een avond overschrijven.
 */
async function requireFakbar(): Promise<void> {
  const session = await getSession();
  if (!session || !canManageFakbar(session)) {
    throw new Error('FORBIDDEN');
  }
}

/** Uitkomst van een knop-actie (verwijderen, sluiten, ...) voor ConfirmActionButton. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

// -----------------------------------------------------------------------------
// Drankkaart
// -----------------------------------------------------------------------------

const DEFAULT_ITEMS: Array<{ name: string; category: FakbarItemCategory; salesPrice: number }> = [
  { name: 'Stella Artois', category: 'VAT', salesPrice: 120 },
  { name: 'Sint-Barbara', category: 'VAT', salesPrice: 150 },
  { name: 'Tripel Karmeliet', category: 'VAT', salesPrice: 230 },
  { name: "Suggestie van 't vat", category: 'VAT', salesPrice: 200 },
  { name: 'Chimay Bleu', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'La Chouffe', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Duvel', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Kriek Lindemans', category: 'BIER_WIJN', salesPrice: 150 },
  { name: 'Leffe', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Paix Dieu', category: 'BIER_WIJN', salesPrice: 250 },
  { name: 'Omer', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Westmalle Tripel', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Desperados', category: 'BIER_WIJN', salesPrice: 250 },
  { name: 'Stella 0.0%', category: 'BIER_WIJN', salesPrice: 120 },
  { name: 'Strongbow Apple', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Strongbow Red', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Kasteelbier Rouge', category: 'BIER_WIJN', salesPrice: 230 },
  { name: 'Stëlz mango', category: 'BIER_WIJN', salesPrice: 200 },
  { name: 'Coca Cola', category: 'FRISDRANK', salesPrice: 120 },
  { name: 'Coca Cola Zero', category: 'FRISDRANK', salesPrice: 120 },
  { name: 'Fanta', category: 'FRISDRANK', salesPrice: 120 },
  { name: 'Sprite', category: 'FRISDRANK', salesPrice: 120 },
  { name: 'Water bruis', category: 'FRISDRANK', salesPrice: 100 },
  { name: 'Water plat', category: 'FRISDRANK', salesPrice: 100 },
  { name: 'Jenever appel-kers', category: 'STERK', salesPrice: 150 },
  { name: 'Jenever bessen', category: 'STERK', salesPrice: 150 },
  { name: 'Passoã', category: 'STERK', salesPrice: 200 },
];

/**
 * Zet de standaardkaart klaar. Bewust een expliciete actie uit het beheer en
 * geen bijwerking van een pageview: dit stond eerder bovenaan de publieke
 * /drankkaart, waardoor elke bezoeker de databank kon laten schrijven.
 */
export async function seedDefaultItemsAction(): Promise<ActionResult> {
  await requireFakbar();
  const existing = await prisma.fakbarItem.count();
  if (existing > 0) {
    return { ok: false, error: 'De drankkaart bevat al artikelen; de standaardkaart is niet toegevoegd.' };
  }
  await prisma.fakbarItem.createMany({ data: DEFAULT_ITEMS });
  revalidateFakbar();
  return { ok: true, message: `${DEFAULT_ITEMS.length} artikelen toegevoegd.` };
}

function readCategory(raw: FormDataEntryValue | null): FakbarItemCategory | null {
  return CATEGORY_ORDER.includes(raw as FakbarItemCategory) ? (raw as FakbarItemCategory) : null;
}

export async function saveItemAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const id = typeof formData.get('id') === 'string' ? String(formData.get('id')).trim() : '';
  const name = String(formData.get('name') ?? '').trim();
  const category = readCategory(formData.get('category'));
  const salesPrice = parseEuroToCents(formData.get('salesPrice'));

  if (!name) return saveError('NAME_REQUIRED');
  if (!category) return saveError('CATEGORY_REQUIRED');
  if (salesPrice === null) return saveError('PRICE_INVALID');

  // Twee keer "Duvel" op de kaart is geen serverfout maar een tikfout, dus een
  // rode toast en niet de error boundary (zie CLAUDE.md).
  const clash = await prisma.fakbarItem.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) return saveError('NAME_TAKEN');

  if (id) {
    await prisma.fakbarItem.update({ where: { id }, data: { name, category, salesPrice } });
  } else {
    await prisma.fakbarItem.create({ data: { name, category, salesPrice } });
  }

  revalidateFakbar();
  return saveOk(id ? 'Artikel bijgewerkt.' : `${name} staat op de kaart.`);
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  await requireFakbar();
  const item = await prisma.fakbarItem.findUnique({
    where: { id },
    select: { name: true, _count: { select: { consumptions: true, stockCounts: true } } },
  });
  if (!item) return { ok: false, error: 'Dat artikel bestaat niet meer.' };

  // De relaties staan op onDelete: Cascade, dus dit neemt ook de tellingen mee.
  // Dat is de bedoeling, maar de gebruiker hoort het vooraf te weten; de
  // dialoog zegt hoeveel rijen eraan hangen.
  await prisma.fakbarItem.delete({ where: { id } });
  revalidateFakbar();
  return { ok: true, message: `${item.name} is van de kaart gehaald.` };
}

// -----------------------------------------------------------------------------
// Weken
// -----------------------------------------------------------------------------

/**
 * Maakt een week aan met haar zes avonden en een stocktellingsrij per artikel.
 *
 * De vorige versie zette hier `new Date(year, 2, 22)` neer: 22 maart, ongeacht
 * het weeknummer en het jaar. Elke week kreeg dus dezelfde zes datums.
 */
export async function createWeekAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const year = Number(formData.get('year'));
  const week = Number(formData.get('weekNumber'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return saveError('YEAR_INVALID');
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) return saveError('WEEK_INVALID');

  const existing = await prisma.fakbarWeek.findUnique({ where: { year_weekNumber: { year, weekNumber: week } } });
  if (existing) return saveError('WEEK_EXISTS');

  const { startDate, endDate } = fakbarWeekRange(year, week);
  const items = await prisma.fakbarItem.findMany({ select: { id: true } });

  await prisma.fakbarWeek.create({
    data: {
      year,
      weekNumber: week,
      startDate,
      endDate,
      evenings: { create: fakbarWeekDays(year, week) },
      stockCounts: { create: items.map((item) => ({ itemId: item.id })) },
    },
  });

  revalidateFakbar();
  return saveOk(`Week ${week} van ${year} staat klaar.`);
}

export async function setWeekStatusAction(weekId: string, status: 'OPEN' | 'CLOSED'): Promise<ActionResult> {
  await requireFakbar();
  const week = await prisma.fakbarWeek.findUnique({ where: { id: weekId }, select: { weekNumber: true } });
  if (!week) return { ok: false, error: 'Die week bestaat niet meer.' };
  await prisma.fakbarWeek.update({ where: { id: weekId }, data: { status } });
  revalidateFakbar();
  return {
    ok: true,
    message: status === 'CLOSED' ? `Week ${week.weekNumber} is afgesloten.` : `Week ${week.weekNumber} staat weer open.`,
  };
}

export async function deleteWeekAction(weekId: string): Promise<ActionResult> {
  await requireFakbar();
  const week = await prisma.fakbarWeek.findUnique({ where: { id: weekId }, select: { weekNumber: true, year: true } });
  if (!week) return { ok: false, error: 'Die week bestaat niet meer.' };
  await prisma.fakbarWeek.delete({ where: { id: weekId } });
  revalidateFakbar();
  return { ok: true, message: `Week ${week.weekNumber} van ${week.year} is verwijderd.` };
}

// -----------------------------------------------------------------------------
// Avondtelling
// -----------------------------------------------------------------------------

/**
 * Eén formulier per avond: wie tapte, de kassatelling, het tappersblad en wat
 * er naar de kluis ging. Alles in één transactie, want een half opgeslagen
 * telling is erger dan een niet opgeslagen telling.
 */
export async function saveEveningAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const eveningId = String(formData.get('eveningId') ?? '');
  const evening = await prisma.fakbarEvening.findUnique({
    where: { id: eveningId },
    select: { id: true, week: { select: { status: true } } },
  });
  if (!evening) return saveError('EVENING_MISSING');
  if (evening.week.status === 'CLOSED') return saveError('WEEK_CLOSED');

  const hoofdtapperRaw = String(formData.get('hoofdtapperId') ?? '').trim();
  const specialeActiviteit = String(formData.get('specialeActiviteit') ?? '').trim();
  const bancontactRevenue = parseEuroToCents(formData.get('bancontactRevenue'));
  const cashToSafe = parseEuroToCents(formData.get('cashToSafe'));
  if (bancontactRevenue === null || cashToSafe === null) return saveError('AMOUNT_INVALID');

  const counts: Record<string, number> = {};
  for (const field of [...DENOMINATIONS.map((d) => d.field), ...VOUCHER_FIELDS.map((v) => v.field)]) {
    const value = parseCount(formData.get(field));
    if (value === null) return saveError('COUNT_INVALID');
    counts[field] = value;
  }

  // Het tappersblad komt binnen als `verbruik:<itemId>:<categorie>`.
  const consumption: { itemId: string; category: FakbarConsumptionCategory; quantity: number }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith('verbruik:')) continue;
    const [, itemId, category] = key.split(':');
    if (!itemId || !CONSUMPTION_ORDER.includes(category as FakbarConsumptionCategory)) continue;
    const quantity = parseCount(raw);
    if (quantity === null) return saveError('COUNT_INVALID');
    consumption.push({ itemId, category: category as FakbarConsumptionCategory, quantity });
  }

  await prisma.$transaction(async (tx) => {
    await tx.fakbarEvening.update({
      where: { id: eveningId },
      data: {
        hoofdtapperId: hoofdtapperRaw || null,
        specialeActiviteit: specialeActiviteit || null,
        bancontactRevenue,
        cashToSafe,
      },
    });

    await tx.fakbarCashRegisterCount.upsert({
      where: { eveningId },
      create: { eveningId, ...counts },
      update: counts,
    });

    // Een nul betekent "niets van dit soort", en dat is geen rij waard; anders
    // groeit de tabel met een lege rij per artikel per categorie per avond.
    await tx.fakbarConsumption.deleteMany({ where: { eveningId } });
    const withQuantity = consumption.filter((row) => row.quantity > 0);
    if (withQuantity.length > 0) {
      await tx.fakbarConsumption.createMany({
        data: withQuantity.map((row) => ({ eveningId, ...row })),
      });
    }
  });

  revalidateFakbar();
  return saveOk('Telling opgeslagen.');
}

// -----------------------------------------------------------------------------
// Stocktelling
// -----------------------------------------------------------------------------

const STOCK_FIELDS = [
  'beginOpslag',
  'levering',
  'naarPost',
  'naarFrigo',
  'eindOpslag',
  'beginTelling',
  'eindTelling',
] as const;

export async function saveStockAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const weekId = String(formData.get('weekId') ?? '');
  const week = await prisma.fakbarWeek.findUnique({
    where: { id: weekId },
    select: { status: true, stockCounts: { select: { id: true } } },
  });
  if (!week) return saveError('WEEK_MISSING');
  if (week.status === 'CLOSED') return saveError('WEEK_CLOSED');

  const known = new Set(week.stockCounts.map((count) => count.id));
  const updates: { id: string; data: Record<string, number> }[] = [];

  for (const id of known) {
    const data: Record<string, number> = {};
    let touched = false;
    for (const field of STOCK_FIELDS) {
      const raw = formData.get(`stock:${id}:${field}`);
      if (raw === null) continue;
      const value = parseCount(raw);
      if (value === null) return saveError('COUNT_INVALID');
      data[field] = value;
      touched = true;
    }
    if (touched) updates.push({ id, data });
  }

  await prisma.$transaction(
    updates.map((update) => prisma.fakbarStockCount.update({ where: { id: update.id }, data: update.data })),
  );

  revalidateFakbar();
  return saveOk('Stocktelling opgeslagen.');
}

// -----------------------------------------------------------------------------
// Specials van een avond
// -----------------------------------------------------------------------------

const SPECIAL_KINDS: FakbarSpecialKind[] = ['DRANK', 'ACTIE'];
/** Hoeveel er hoogstens op één avond staan; het bord aan de toog is ook niet oneindig. */
const MAX_SPECIALS = 8;

/**
 * De specials van één avond: wat er die avond extra achter de toog staat, of
 * welke actie er loopt.
 *
 * De hele lijst komt in één keer binnen en vervangt wat er stond. Dat is bij een
 * handvol regels eenvoudiger en betrouwbaarder dan per rij bijhouden wat er
 * toegevoegd, gewijzigd of verwijderd is, en het scheelt de gebruiker een
 * opslaan-knop per regel.
 */
export async function saveEveningSpecialsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const eveningId = String(formData.get('eveningId') ?? '');
  const evening = await prisma.fakbarEvening.findUnique({
    where: { id: eveningId },
    select: { id: true, week: { select: { status: true } } },
  });
  if (!evening) return saveError('EVENING_MISSING');
  if (evening.week.status === 'CLOSED') return saveError('WEEK_CLOSED');

  const rows: { kind: FakbarSpecialKind; title: string; note: string | null; itemId: string | null; price: number | null; sortOrder: number }[] = [];

  for (let index = 0; index < MAX_SPECIALS; index += 1) {
    const title = String(formData.get(`special:${index}:title`) ?? '').trim();
    // Een lege titel betekent: die regel is er niet. Zo hoeft de client geen
    // gaten in de nummering te vermijden bij het verwijderen van een rij.
    if (!title) continue;

    const kindRaw = formData.get(`special:${index}:kind`);
    const kind = SPECIAL_KINDS.includes(kindRaw as FakbarSpecialKind) ? (kindRaw as FakbarSpecialKind) : null;
    if (!kind) return saveError('SPECIAL_KIND_REQUIRED');

    const priceRaw = String(formData.get(`special:${index}:price`) ?? '').trim();
    const price = priceRaw === '' ? null : parseEuroToCents(priceRaw);
    if (price === null && priceRaw !== '') return saveError('PRICE_INVALID');

    const itemId = String(formData.get(`special:${index}:itemId`) ?? '').trim() || null;
    const note = String(formData.get(`special:${index}:note`) ?? '').trim() || null;

    rows.push({ kind, title: title.slice(0, 120), note, itemId, price, sortOrder: rows.length });
  }

  // Een artikel dat intussen van de kaart is, mag de opslag niet laten gooien:
  // dan verliest de gebruiker alles wat hij net intikte om één verwijzing.
  const referenced = rows.map((row) => row.itemId).filter((id): id is string => id !== null);
  if (referenced.length > 0) {
    const existing = await prisma.fakbarItem.findMany({
      where: { id: { in: referenced } },
      select: { id: true },
    });
    const known = new Set(existing.map((item) => item.id));
    for (const row of rows) {
      if (row.itemId && !known.has(row.itemId)) row.itemId = null;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.fakbarEveningSpecial.deleteMany({ where: { eveningId } });
    if (rows.length > 0) {
      await tx.fakbarEveningSpecial.createMany({
        data: rows.map((row) => ({ eveningId, ...row })),
      });
    }
  });

  revalidateFakbar();
  return saveOk(
    rows.length === 0
      ? 'De specials van deze avond zijn gewist.'
      : `${rows.length} ${rows.length === 1 ? 'special' : 'specials'} opgeslagen.`,
  );
}

// -----------------------------------------------------------------------------
// Verhuur van een avond
// -----------------------------------------------------------------------------

export async function saveEveningRentalAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const eveningId = String(formData.get('eveningId') ?? '');
  const evening = await prisma.fakbarEvening.findUnique({ where: { id: eveningId }, select: { id: true } });
  if (!evening) return saveError('EVENING_MISSING');

  if (formData.get('remove') === 'true') {
    await prisma.fakbarRental.deleteMany({ where: { eveningId } });
    revalidateFakbar();
    return saveOk('De verhuur is van deze avond gehaald.');
  }

  const rentalFee = parseEuroToCents(formData.get('rentalFee'));
  const expectedRevenue = parseEuroToCents(formData.get('expectedRevenue'));
  const effectiveProfit = parseEuroToCents(formData.get('effectiveProfit'));
  if (rentalFee === null || expectedRevenue === null || effectiveProfit === null) return saveError('AMOUNT_INVALID');

  const data = { rentalFee, expectedRevenue, effectiveProfit };
  await prisma.fakbarRental.upsert({ where: { eveningId }, create: { eveningId, ...data }, update: data });

  revalidateFakbar();
  return saveOk('Verhuur opgeslagen.');
}

// -----------------------------------------------------------------------------
// Instellingen
// -----------------------------------------------------------------------------

export async function saveOpeningHoursAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const hours = ELIXIR_DAYS.map((_, index) => String(formData.get(`hours:${index}`) ?? '').trim());
  const note = String(formData.get('note') ?? '').trim();
  await saveElixirHours({ note, hours });

  // Ook de hoofdsite leest deze rij; die pad-revalidatie kunnen we van hieruit
  // niet doen (andere app), maar de openingsurenband daar heeft haar eigen
  // korte revalidate.
  revalidateFakbar();
  return saveOk('Openingsuren opgeslagen.');
}

export async function saveRentalSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const feeCents = parseEuroToCents(formData.get('feeCents'));
  if (feeCents === null) return saveError('AMOUNT_INVALID');

  const contactEmail = String(formData.get('contactEmail') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return saveError('EMAIL_INVALID');

  const conditions: RentalSettings['conditions'] = [];
  for (let index = 0; index < 6; index += 1) {
    const title = String(formData.get(`condition:${index}:title`) ?? '').trim();
    const body = String(formData.get(`condition:${index}:body`) ?? '').trim();
    if (title || body) conditions.push({ title, body });
  }
  if (conditions.length === 0) return saveError('CONDITIONS_REQUIRED');

  await saveRentalSettings({
    feeCents,
    period: String(formData.get('period') ?? '').trim(),
    contactEmail,
    conditions,
  });

  revalidateFakbar();
  return saveOk('Verhuurvoorwaarden opgeslagen.');
}

// -----------------------------------------------------------------------------

/**
 * Zowel de publieke pagina's als het beheerscherm waar je net iets wijzigde.
 * Enkel de publieke route revalideren laat de lijst in het beheer ongewijzigd
 * staan (zie CLAUDE.md).
 */
function revalidateFakbar(): void {
  for (const path of [
    '/',
    '/drankkaart',
    '/openingsuren',
    '/verhuur',
    '/admin',
    '/admin/weekoverzicht',
    '/admin/avondtelling',
    '/admin/stocktelling',
    '/admin/instellingen',
  ]) {
    revalidatePath(path);
  }
  revalidatePath('/admin/avondtelling/[id]', 'page');
}
