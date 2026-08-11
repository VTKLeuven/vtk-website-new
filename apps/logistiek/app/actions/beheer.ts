'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';
import { currentWorkingYear } from '@vtk/auth';
import { requireManage } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import {
  describeReservationChanges,
  formatDateTime,
  isOnQuarterHour,
  parseDateOnly,
  rangesOverlap,
  transportPriceCents,
} from '@/lib/uitleen';
import { notifyReservation, notifyTransport } from '@/lib/uitleen-mail';
import {
  consumeFlesserkeStock,
  flesserkeReserved,
  isDriver,
  reservedQuantities,
  reservationConflicts,
  restoreFlesserkeStock,
  searchDriverCandidates,
  syncFlesserkeItemTotals,
  syncItemQuantityFromUnits,
  type DriverCandidate,
} from '@/lib/uitleen-server';
import {
  buildReservationData,
  parseBrusselsDateTime,
  type ReservationFormInput,
} from '@/lib/reservation-form';
import { buildTransportBookings, type TransportFormInput } from '@/lib/transport-form';
import { runSerializable } from '@/lib/tx';
import type { ActionResult } from './uitleen';

function revalidateBeheer() {
  revalidatePath('/beheer');
  revalidatePath('/beheer/aanvragen');
  revalidatePath('/beheer/vervoer');
  revalidatePath('/beheer/materiaal');
  revalidatePath('/beheer/sjablonen');
  revalidatePath('/beheer/flesserke');
  revalidatePath('/beheer/evenementen');
  revalidatePath('/beheer/kalender');
  revalidatePath('/beheer/instellingen');
  revalidatePath('/beheer/chauffeurs');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
  revalidatePath('/reservaties');
  revalidatePath('/ritten');
}

// ---------------------------------------------------------------------------
// Inventaris
// ---------------------------------------------------------------------------

function parseEuroToCents(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (text === '') return 0;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Versie waarop de editor het record laadde (de `updatedAt` die het formulier
 * meestuurt). Voor optimistic locking: bij het opslaan matchen we op deze
 * `updatedAt`, zodat een save die op verouderde data is gebaseerd (iemand
 * anders paste intussen aan) faalt in plaats van stilletjes te overschrijven.
 * Prisma beheert `@updatedAt` op milliseconde-precisie, dus de round-trip is
 * exact. Ontbreekt de waarde, dan valt de guard weg (last-write-wins).
 */
function parseExpectedVersion(raw: FormDataEntryValue | null): Date | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function saveCategoryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const sortIndex = Number.parseInt(String(formData.get('sortIndex') ?? '0'), 10) || 0;
  if (!name) return saveError('NAME_REQUIRED');

  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const updated = await prisma.uitleenCategory.updateMany({
      where: expected ? { id, updatedAt: expected } : { id },
      data: { name, sortIndex },
    });
    if (updated.count === 0) return saveError('STALE');
  } else {
    await prisma.uitleenCategory.create({ data: { name, sortIndex } });
  }

  revalidateBeheer();
  return saveOk();
}

export async function deactivateCategoryAction(categoryId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenCategory.update({ where: { id: categoryId }, data: { active: false } });
  revalidateBeheer();
  return { ok: true, message: 'Categorie uit de catalogus gehaald.' };
}

const ITEM_CONDITIONS = ['WERKT', 'KAPOT', 'TESTEN', 'ONVOLLEDIG'] as const;
type ItemCondition = (typeof ITEM_CONDITIONS)[number];

function parseSetContents(raw: FormDataEntryValue | null): Array<{ label: string; quantity: number }> {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        label: String(row?.label ?? '').trim(),
        quantity: Number.parseInt(String(row?.quantity ?? '1'), 10) || 1,
      }))
      .filter((row) => row.label !== '');
  } catch {
    return [];
  }
}

function parseCatalogRows(raw: FormDataEntryValue | null, fields: readonly string[]) {
  const text = String(raw ?? '').trim();
  if (!text) return [] as Array<Record<string, string>>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => Object.fromEntries(fields.map((field) => [field, String(row?.[field] ?? '').trim()])))
      .filter((row) => fields.every((field) => row[field]));
  } catch {
    return [];
  }
}

const UNIT_LABEL_MAX = 60;

type UnitInput = {
  /** Leeg voor een exemplaar dat nog aangemaakt moet worden. */
  id: string;
  label: string;
  condition: ItemCondition;
  conditionNote: string;
  active: boolean;
};

/**
 * De exemplaren uit het itemformulier. `null` betekent "het formulier stuurde
 * geen exemplaren mee" (het toevoegformulier doet dat niet) en laat ze met rust;
 * een lege array betekent wél "er zijn er geen meer".
 */
function parseUnits(raw: FormDataEntryValue | null): UnitInput[] | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((row) => {
      const entry = (row ?? {}) as Record<string, unknown>;
      const condition = String(entry.condition ?? 'WERKT');
      return {
        id: String(entry.id ?? '').trim(),
        label: String(entry.label ?? '').trim(),
        condition: ITEM_CONDITIONS.includes(condition as ItemCondition)
          ? (condition as ItemCondition)
          : 'WERKT',
        conditionNote: String(entry.conditionNote ?? '').trim(),
        active: entry.active !== false,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Staan alle exemplaren weer op dezelfde staat, dan is de opsplitsing haar reden
 * kwijt: het onderscheid dat ze bijhield bestaat niet meer. Ze worden dan weer
 * één rij, zodat de inventaris niet volloopt met opsplitsingen van vroeger.
 *
 * KAPOT valt hier buiten: bij een item met exemplaren telt kapot niet mee voor
 * de voorraad, bij een item zonder exemplaren wel. Vier kapotte frigo's
 * samenvoegen zou de voorraad dus stil van 0 naar 4 tillen.
 */
function unitsAreUniform(rows: UnitInput[]): boolean {
  const first = rows[0];
  if (!first || first.condition === 'KAPOT') return false;
  return rows.every(
    (row) =>
      row.active && row.condition === first.condition && row.conditionNote === first.conditionNote
  );
}

/**
 * Zet de exemplaren van een item gelijk aan wat het formulier meestuurde, en
 * geeft terug of ze daarbij weer samengevoegd zijn tot één rij.
 *
 * Bijwerken op id in plaats van alles weggooien en opnieuw aanmaken: een
 * exemplaar heeft historiek aan zich hangen die je niet wil laten sneuvelen
 * omdat iemand een prijs aanpaste.
 */
async function writeUnits(
  tx: Prisma.TransactionClient,
  itemId: string,
  rows: UnitInput[]
): Promise<boolean> {
  const existing = await tx.uitleenItemUnit.findMany({ where: { itemId }, select: { id: true } });
  const known = new Set(existing.map((unit) => unit.id));
  const kept = new Set(rows.map((row) => row.id).filter(Boolean));
  const removed = existing.filter((unit) => !kept.has(unit.id)).map((unit) => unit.id);
  if (removed.length > 0) await tx.uitleenItemUnit.deleteMany({ where: { id: { in: removed } } });

  for (const [sortIndex, row] of rows.entries()) {
    const data = {
      label: row.label,
      condition: row.condition,
      conditionNote: row.conditionNote || null,
      active: row.active,
      sortIndex,
    };
    if (row.id && known.has(row.id)) {
      await tx.uitleenItemUnit.update({ where: { id: row.id }, data });
    } else {
      await tx.uitleenItemUnit.create({ data: { ...data, itemId } });
    }
  }

  if (!unitsAreUniform(rows)) return false;
  await tx.uitleenItemUnit.deleteMany({ where: { itemId } });
  await tx.uitleenItem.update({
    where: { id: itemId },
    data: {
      quantity: rows.length,
      condition: rows[0].condition,
      conditionNote: rows[0].conditionNote || null,
    },
  });
  return true;
}

/** JSON-array van id's uit een hidden input, ontdubbeld. */
function parseIdList(raw: FormDataEntryValue | null): string[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((value) => String(value ?? '').trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export async function saveItemAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const quantity = Number.parseInt(String(formData.get('quantity') ?? ''), 10);
  const priceCents = parseEuroToCents(formData.get('price'));
  const depositCents = parseEuroToCents(formData.get('deposit'));
  const photoKey = String(formData.get('photoKey') ?? '').trim();
  const locationShelf = String(formData.get('locationShelf') ?? '').trim();
  const locationRack = String(formData.get('locationRack') ?? '').trim();
  const conditionRaw = String(formData.get('condition') ?? 'WERKT').trim();
  const condition: ItemCondition = ITEM_CONDITIONS.includes(conditionRaw as ItemCondition)
    ? (conditionRaw as ItemCondition)
    : 'WERKT';
  const conditionNote = String(formData.get('conditionNote') ?? '').trim();
  const volumeRaw = String(formData.get('volumeLiters') ?? '').trim();
  const volumeLiters = volumeRaw === '' ? null : Number.parseInt(volumeRaw, 10);
  if (volumeLiters !== null && (!Number.isInteger(volumeLiters) || volumeLiters < 0)) {
    return saveError('VOLUME_INVALID');
  }
  const isSet = String(formData.get('isSet') ?? '') === 'on';
  const setContents = isSet ? parseSetContents(formData.get('setContents')) : [];
  const photos = parseCatalogRows(formData.get('photos'), ['key']);
  const properties = parseCatalogRows(formData.get('properties'), ['label', 'value']);
  const downloads = parseCatalogRows(formData.get('downloads'), ['label', 'key']);
  const alternativeIds = parseIdList(formData.get('alternativeIds'));
  const units = parseUnits(formData.get('units'));

  if (!name) return saveError('NAME_REQUIRED');
  if (!Number.isInteger(quantity) || quantity < 1) return saveError('QUANTITY_INVALID');
  if (priceCents === null || depositCents === null) return saveError('AMOUNT_INVALID');
  if (units?.some((unit) => !unit.label)) return saveError('UNIT_LABEL_REQUIRED');
  if (units?.some((unit) => unit.label.length > UNIT_LABEL_MAX)) {
    return saveError('UNIT_LABEL_TOO_LONG');
  }

  const data = {
    name,
    description: description || null,
    categoryId: categoryId || null,
    quantity,
    priceCents,
    depositCents,
    photoKey: photoKey || null,
    locationShelf: locationShelf || null,
    locationRack: locationRack || null,
    condition,
    conditionNote: conditionNote || null,
    volumeLiters,
    isSet,
  };

  let merged = false;
  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const stale = await prisma.$transaction(async (tx) => {
      // Guard op de geladen versie: raakt 0 rijen als iemand anders het item
      // intussen wijzigde (of het verdween). updateMany laat een samengestelde
      // where toe; de scalar-update bumpt updatedAt vanzelf.
      const updated = await tx.uitleenItem.updateMany({
        where: expected ? { id, updatedAt: expected } : { id },
        data,
      });
      if (updated.count === 0) return true;
      await tx.uitleenSetContent.deleteMany({ where: { itemId: id } });
      await tx.uitleenItemPhoto.deleteMany({ where: { itemId: id } });
      await tx.uitleenItemProperty.deleteMany({ where: { itemId: id } });
      await tx.uitleenItemDownload.deleteMany({ where: { itemId: id } });
      if (setContents.length > 0) {
        await tx.uitleenSetContent.createMany({
          data: setContents.map((row, index) => ({
            itemId: id,
            label: row.label,
            quantity: row.quantity,
            sortIndex: index,
          })),
        });
      }
      if (photos.length) await tx.uitleenItemPhoto.createMany({ data: photos.map((row, sortIndex) => ({ itemId: id, key: row.key, sortIndex })) });
      if (properties.length) await tx.uitleenItemProperty.createMany({ data: properties.map((row, sortIndex) => ({ itemId: id, label: row.label, value: row.value, sortIndex })) });
      if (downloads.length) await tx.uitleenItemDownload.createMany({ data: downloads.map((row, sortIndex) => ({ itemId: id, label: row.label, key: row.key, sortIndex })) });
      await writeAlternatives(tx, id, alternativeIds);
      if (units) merged = await writeUnits(tx, id, units);
      // Houdt dit item exemplaren bij, dan wint hun telling van het getal in het
      // formulier. Het veld staat daar read-only, maar een oud tabblad of een
      // handmatige post zou de voorraad anders stil laten afwijken van wat er in
      // de loods staat.
      await syncItemQuantityFromUnits(tx, id);
      return false;
    });
    if (stale) return saveError('STALE');
  } else {
    const created = await prisma.uitleenItem.create({
      data: {
        ...data,
        setContents: {
          create: setContents.map((row, index) => ({
            label: row.label,
            quantity: row.quantity,
            sortIndex: index,
          })),
        },
        photos: { create: photos.map((row, sortIndex) => ({ key: row.key, sortIndex })) },
        properties: { create: properties.map((row, sortIndex) => ({ label: row.label, value: row.value, sortIndex })) },
        downloads: { create: downloads.map((row, sortIndex) => ({ label: row.label, key: row.key, sortIndex })) },
      },
      select: { id: true },
    });
    await writeAlternatives(prisma, created.id, alternativeIds);
  }

  revalidateBeheer();
  // Ook de ledencatalogus: alternatieven en set-inhoud worden daar getoond.
  revalidatePath('/materiaal');
  return saveOk(
    merged
      ? 'Item opgeslagen. Alle exemplaren stonden op dezelfde staat, dus ze zijn weer één rij.'
      : undefined
  );
}

/**
 * Zet de alternatieven van één item, in beide richtingen. De koppeling is
 * wederzijds bedoeld (de actieve en de passieve box zijn elkaars alternatief),
 * dus schrijven we per paar twee rijen en ruimen we ook de tegenrichting op.
 * Zonder dat laatste blijft B naar A wijzen nadat je A's lijst leegmaakte, en
 * ziet niemand waarom die suggestie nog opduikt.
 */
async function writeAlternatives(
  tx: Prisma.TransactionClient | typeof prisma,
  itemId: string,
  alternativeIds: string[]
): Promise<void> {
  const chosen = alternativeIds.filter((id) => id !== itemId);
  await tx.uitleenItemAlternative.deleteMany({
    where: { OR: [{ itemId }, { alternativeId: itemId }] },
  });
  if (chosen.length === 0) return;
  // Alleen bestaande items; een id uit een verouderd formulier laat de hele
  // opslag anders falen op een foreign key.
  const existing = await tx.uitleenItem.findMany({
    where: { id: { in: chosen } },
    select: { id: true },
  });
  await tx.uitleenItemAlternative.createMany({
    data: existing.flatMap((other) => [
      { itemId, alternativeId: other.id },
      { itemId: other.id, alternativeId: itemId },
    ]),
    skipDuplicates: true,
  });
}

/** Snelle voorraadbijstelling per item, zonder het hele item te bewerken. */
export async function setItemQuantityAction(itemId: string, quantity: number): Promise<ActionResult> {
  await requireManage();
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, error: 'Ongeldig aantal.' };
  // Houdt dit item exemplaren bij, dan is de voorraad hun telling. Een getal
  // intypen zou dat stil overschrijven tot de eerstvolgende wijziging aan een
  // exemplaar het weer terugzet; dan liever hier weigeren en zeggen waarom.
  const units = await prisma.uitleenItemUnit.count({ where: { itemId } });
  if (units > 0) {
    return {
      ok: false,
      error: 'Dit item houdt exemplaren bij; de voorraad volgt daaruit. Pas de exemplaren aan.',
    };
  }
  await prisma.uitleenItem.update({ where: { id: itemId }, data: { quantity } });
  revalidateBeheer();
  return { ok: true, message: 'Voorraad bijgewerkt.' };
}

export async function deactivateItemAction(itemId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenItem.update({ where: { id: itemId }, data: { active: false } });
  revalidateBeheer();
  return { ok: true, message: 'Item uit de catalogus gehaald; de historiek blijft bewaard.' };
}

export async function activateItemAction(itemId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenItem.update({ where: { id: itemId }, data: { active: true } });
  revalidateBeheer();
  return { ok: true, message: 'Item terug in de catalogus gezet.' };
}

// ---------------------------------------------------------------------------
// Evenementen (A8)
// ---------------------------------------------------------------------------

function revalidateEvents() {
  revalidatePath('/beheer/evenementen');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
  revalidatePath('/flesserke');
}

export async function saveEventAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const id = String(formData.get('eventId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  const startRaw = String(formData.get('startAt') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!name) return saveError('NAME_REQUIRED');

  const startAt = startRaw ? parseBrusselsDateTime(startRaw) : null;
  if (startRaw && !startAt) return saveError('START_INVALID');

  const data = {
    name: name.slice(0, 200),
    location: location.slice(0, 300) || null,
    startAt,
    note: note.slice(0, 1000) || null,
  };

  if (id) await prisma.uitleenEvent.update({ where: { id }, data });
  else await prisma.uitleenEvent.create({ data: { ...data, createdById: session.user.id } });

  revalidateBeheer();
  revalidateEvents();
  return saveOk();
}

/**
 * Een aanvraag onder een evenement hangen, of ervan losmaken (`eventId` leeg).
 *
 * Werkt op materiaal-, flesserke- en vervoeraanvragen; bij een heen-en-terugrit
 * of meerdere voertuigen gaat de hele groep mee, want die horen sowieso bij
 * elkaar.
 */
export async function linkToEventAction(
  target: { kind: 'reservation' | 'transport'; id: string },
  eventId: string | null
): Promise<ActionResult> {
  await requireManage();

  if (eventId) {
    const exists = await prisma.uitleenEvent.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!exists) return { ok: false, error: 'Evenement niet gevonden.' };
  }

  if (target.kind === 'reservation') {
    const updated = await prisma.uitleenReservation.updateMany({
      where: { id: target.id },
      data: { eventId },
    });
    if (updated.count === 0) return { ok: false, error: 'Aanvraag niet gevonden.' };
  } else {
    const booking = await prisma.uitleenTransportBooking.findUnique({
      where: { id: target.id },
      select: { tripGroupId: true },
    });
    if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
    await prisma.uitleenTransportBooking.updateMany({
      where: booking.tripGroupId ? { tripGroupId: booking.tripGroupId } : { id: target.id },
      data: { eventId },
    });
  }

  revalidateBeheer();
  revalidateEvents();
  return { ok: true, message: eventId ? 'Aan het evenement gekoppeld.' : 'Losgekoppeld.' };
}

/**
 * Het evenement verwijderen, niet wat eronder hangt.
 *
 * De aanvragen zijn het echte werk; de koepel is een groepering. `onDelete:
 * SetNull` laat ze staan, en dat is ook wat de bevestigingstekst belooft.
 */
export async function deleteEventAction(eventId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenEvent.delete({ where: { id: eventId } });
  revalidateBeheer();
  revalidateEvents();
  return { ok: true, message: 'Evenement verwijderd; de aanvragen blijven bestaan.' };
}

// ---------------------------------------------------------------------------
// Sjablonen
// ---------------------------------------------------------------------------

/**
 * Een bestaande aanvraag bewaren als sjabloon.
 *
 * Dit is de enige manier om er een te maken: een cantus bestaat al voor iemand
 * hem als sjabloon wil, en de lijst opnieuw intikken in een leeg scherm is precies
 * het werk dat we willen vermijden.
 */
export async function saveTemplateFromReservationAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const reservationId = String(formData.get('reservationId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!name) return saveError('NAME_REQUIRED');

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: {
      groupId: true,
      lines: { select: { itemId: true, quantity: true } },
    },
  });
  if (!reservation) return saveError('NOT_FOUND');
  if (reservation.lines.length === 0) return saveError('NO_LINES');

  // Dezelfde items kunnen niet twee keer in één sjabloon: de unieke index zou het
  // anders weigeren met een databasefout in plaats van een nette melding.
  const totals = new Map<string, number>();
  for (const line of reservation.lines) {
    totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity);
  }

  await prisma.uitleenRequestTemplate.create({
    data: {
      name: name.slice(0, 120),
      description: description.slice(0, 300) || null,
      groupId: reservation.groupId,
      createdById: session.user.id,
      lines: {
        create: [...totals.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
      },
    },
  });

  revalidateBeheer();
  return saveOk();
}

/**
 * Een sjabloon met de hand samenstellen of bijwerken: naam, toelichting en de
 * itemlijst uit de catalogusbrowser.
 *
 * De weg via een bestaande aanvraag blijft bestaan en blijft de gewone: je maakt
 * een sjabloon meestal omdat je merkt dat dezelfde lijst terugkomt. Maar bij het
 * opzetten van nul bestaat die aanvraag nog niet, en dan drie nepaanvragen
 * indienen en weer opruimen is geen manier van werken.
 *
 * Geen post op een handgemaakt sjabloon: die kwam van de aanvraag waaruit het
 * gemaakt werd, en verzinnen welke post erbij hoort maakt het label een gok. Het
 * is toch enkel een label, geen filter.
 */
export async function saveTemplateAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const id = String(formData.get('templateId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!name) return saveError('NAME_REQUIRED');

  const lines = parseTemplateLines(formData.get('lines'));
  if (lines.length === 0) return saveError('NO_LINES');

  // Enkel bestaande, actieve items: een id uit een verouderd tabblad zou de hele
  // opslag laten falen op een foreign key.
  const known = await prisma.uitleenItem.findMany({
    where: { id: { in: lines.map((line) => line.itemId) }, active: true },
    select: { id: true },
  });
  const knownIds = new Set(known.map((item) => item.id));
  const kept = lines.filter((line) => knownIds.has(line.itemId));
  if (kept.length === 0) return saveError('NO_LINES');

  const data = {
    name: name.slice(0, 120),
    description: description.slice(0, 300) || null,
  };

  if (id) {
    await prisma.$transaction(async (tx) => {
      await tx.uitleenRequestTemplate.update({ where: { id }, data });
      await tx.uitleenRequestTemplateLine.deleteMany({ where: { templateId: id } });
      await tx.uitleenRequestTemplateLine.createMany({
        data: kept.map((line) => ({ templateId: id, itemId: line.itemId, quantity: line.quantity })),
      });
    });
  } else {
    await prisma.uitleenRequestTemplate.create({
      data: {
        ...data,
        createdById: session.user.id,
        lines: { create: kept.map((line) => ({ itemId: line.itemId, quantity: line.quantity })) },
      },
    });
  }

  revalidateBeheer();
  revalidatePath('/materiaal');
  return saveOk();
}

/**
 * De itemlijst uit de catalogusbrowser: `{ itemId, quantity }` per gekozen item.
 * Dubbele items worden opgeteld; de unieke index op (templateId, itemId) zou ze
 * anders weigeren met een databasefout in plaats van een nette melding.
 */
function parseTemplateLines(raw: FormDataEntryValue | null): Array<{ itemId: string; quantity: number }> {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    const totals = new Map<string, number>();
    for (const row of parsed) {
      const entry = (row ?? {}) as Record<string, unknown>;
      const itemId = String(entry.itemId ?? '').trim();
      const quantity = Number.parseInt(String(entry.quantity ?? ''), 10);
      if (!itemId || !Number.isInteger(quantity) || quantity < 1) continue;
      totals.set(itemId, (totals.get(itemId) ?? 0) + quantity);
    }
    return [...totals.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
  } catch {
    return [];
  }
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenRequestTemplate.delete({ where: { id: templateId } });
  revalidateBeheer();
  return { ok: true, message: 'Sjabloon verwijderd.' };
}

// ---------------------------------------------------------------------------
// Materiaalaanvragen
// ---------------------------------------------------------------------------

export async function approveReservationAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const reservationId = String(formData.get('reservationId') ?? '');
  const paymentMode = String(formData.get('paymentMode') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (paymentMode !== 'ONLINE' && paymentMode !== 'OFFLINE') return saveError('MODE_REQUIRED');

  // Harde beschikbaarheidscheck en statuswissel in één transactie, zodat twee
  // gelijktijdige goedkeuringen niet allebei dezelfde voorraad wegkapen.
  const outcome = await runSerializable(async (tx) => {
    const reservation = await tx.uitleenReservation.findUnique({
      where: { id: reservationId },
      include: { lines: { include: { item: true } }, flesserkeLines: { include: { item: true } } },
    });
    if (!reservation) return { error: 'NOT_FOUND' as const };
    if (reservation.status !== 'REQUESTED') return { error: 'NOT_REQUESTED' as const };

    const reserved = await reservedQuantities(tx, reservation.pickupDate, reservation.returnDate, {
      excludeReservationId: reservation.id,
    });
    for (const line of reservation.lines) {
      const available = line.item.quantity - (reserved.get(line.itemId) ?? 0);
      if (line.quantity > available) {
        return { error: 'NO_STOCK' as const, itemName: line.itemName };
      }
    }

    // Flesserke: verbruiksstock, status-gebaseerd gereserveerd (geen datumoverlap).
    if (reservation.flesserkeLines.length > 0) {
      const flReserved = await flesserkeReserved(tx, { excludeReservationId: reservation.id });
      for (const line of reservation.flesserkeLines) {
        const available = line.item.quantity - (flReserved.get(line.flesserkeItemId) ?? 0);
        if (line.quantity > available) {
          return { error: 'NO_STOCK' as const, itemName: line.itemName };
        }
      }
    }

    await tx.uitleenReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'APPROVED',
        paymentMode,
        adminNote: adminNote || null,
        decidedAt: new Date(),
        decidedById: session.user.id,
      },
    });
    await writeAudit(tx, { reservationId: reservation.id }, {
      kind: 'STATUS_CHANGED',
      fromStatus: reservation.status,
      toStatus: 'APPROVED',
      note: paymentMode === 'ONLINE' ? 'online betalen' : 'betalen aan de balie',
      actorId: session.user.id,
    });
    return { error: null };
  });

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'NOT_REQUESTED') return saveError('NOT_REQUESTED');
  if (outcome.error === 'NO_STOCK') return saveError('NO_STOCK');

  // Pas na de transactie: een mail over een goedkeuring die door een rollback
  // niet doorging, is erger dan geen mail.
  await notifyReservation(
    reservationId,
    'APPROVED',
    paymentMode === 'ONLINE'
      ? 'Betalen gebeurt online; je vindt de betaalknop bij je aanvraag.'
      : 'Betalen gebeurt aan de balie bij het afhalen.'
  );

  revalidateBeheer();
  return saveOk();
}

export async function rejectReservationAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const reservationId = String(formData.get('reservationId') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (!adminNote) return saveError('NOTE_REQUIRED');

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return saveError('NOT_FOUND');
  if (reservation.status !== 'REQUESTED') return saveError('NOT_REQUESTED');

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: {
      status: 'REJECTED',
      adminNote,
      decidedAt: new Date(),
      decidedById: session.user.id,
    },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: reservation.status,
    toStatus: 'REJECTED',
    note: `reden: ${adminNote}`,
    actorId: session.user.id,
  });
  await notifyReservation(reservationId, 'REJECTED', adminNote);

  revalidateBeheer();
  return saveOk();
}

/**
 * Eén lijn af- of terug aanvinken bij het klaarzetten.
 *
 * Bewust per lijn en niet per aanvraag: een shift zet een aanvraag zelden in één
 * keer klaar, en de volgende shift moet zien hoever de vorige raakte. Het schrijft
 * geen historiekregel; twaalf regels "lijn afgevinkt" zouden de historiek van de
 * aanvraag onleesbaar maken, en wie wat klaarzette staat al op de lijn zelf.
 */
export async function setLinePreparedAction(
  lineId: string,
  prepared: boolean
): Promise<ActionResult> {
  const session = await requireManage();

  const line = await prisma.uitleenReservationLine.findUnique({
    where: { id: lineId },
    select: { reservation: { select: { id: true, status: true } } },
  });
  if (!line) return { ok: false, error: 'Lijn niet gevonden.' };
  // Klaarzetten hoort bij een aanvraag die nog moet vertrekken. Na het
  // terugbrengen is het vinkje geschiedenis, niet iets om nog te wijzigen.
  if (line.reservation.status !== 'APPROVED' && line.reservation.status !== 'PICKED_UP') {
    return { ok: false, error: 'Klaarzetten kan enkel bij een goedgekeurde aanvraag.' };
  }

  await prisma.uitleenReservationLine.update({
    where: { id: lineId },
    data: prepared
      ? { preparedAt: new Date(), preparedById: session.user.id }
      : { preparedAt: null, preparedById: null },
  });

  revalidatePath(`/beheer/aanvragen/${line.reservation.id}`);
  revalidatePath('/beheer/aanvragen');
  return { ok: true };
}

export async function markPickedUpAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'APPROVED') {
    return { ok: false, error: 'Enkel een goedgekeurde reservatie kan afgehaald worden.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { status: 'PICKED_UP', pickedUpAt: new Date(), pickedUpById: session.user.id },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'APPROVED',
    toStatus: 'PICKED_UP',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als afgehaald.' };
}

/**
 * Terugbrengen. `flesserkeReturned` mapt flesserke-lijn-id op het teruggekeerde
 * aantal (gesloten terug in stock); het verbruik (quantity - returned) wordt van
 * de voorraad afgeboekt. Alles in één transactie zodat de stock klopt.
 */
export async function markReturnedAction(
  reservationId: string,
  flesserkeReturned?: Record<string, number>
): Promise<ActionResult> {
  const session = await requireManage();

  // Statusguard en voorraadafboeking in één Serializable-transactie: twee
  // gelijktijdige "teruggebracht"-clicks mogen de flesserke-stock niet dubbel
  // afboeken. Verbruik per lijn = gereserveerd min teruggekeerd; ontbreekt een
  // waarde, dan is alles verbruikt (0 terug).
  const outcome = await runSerializable(async (tx) => {
    const reservation = await tx.uitleenReservation.findUnique({
      where: { id: reservationId },
      include: { flesserkeLines: true },
    });
    if (!reservation) return { error: 'NOT_FOUND' as const };
    if (reservation.status !== 'PICKED_UP') return { error: 'NOT_PICKED_UP' as const };

    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: { status: 'RETURNED', returnedAt: new Date(), returnedById: session.user.id },
    });
    for (const line of reservation.flesserkeLines) {
      const raw = flesserkeReturned?.[line.id];
      const returned = Number.isInteger(raw) ? Math.max(0, Math.min(line.quantity, raw as number)) : 0;
      const consumed = line.quantity - returned;
      await tx.uitleenFlesserkeLine.update({ where: { id: line.id }, data: { returnedQuantity: returned } });
      // Oudste lading eerst; het item houdt de som en de eerstvolgende datum bij.
      if (consumed > 0) await consumeFlesserkeStock(tx, line.flesserkeItemId, consumed);
    }
    await writeAudit(tx, { reservationId }, {
      kind: 'STATUS_CHANGED',
      fromStatus: 'PICKED_UP',
      toStatus: 'RETURNED',
      actorId: session.user.id,
    });
    return { error: null };
  });

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome.error === 'NOT_PICKED_UP') {
    return { ok: false, error: 'Enkel afgehaald materiaal kan teruggebracht worden.' };
  }

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als teruggebracht.' };
}

export async function markPaidOfflineAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.paidOfflineAt) return { ok: false, error: 'Al gemarkeerd als betaald.' };

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { paidOfflineAt: new Date() },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaald aan de balie',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als betaald.' };
}

export async function markDepositReturnedAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'RETURNED') {
    return { ok: false, error: 'De waarborg gaat pas terug nadat alles teruggebracht is.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { depositReturnedAt: new Date() },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'waarborg teruggegeven',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Waarborg gemarkeerd als teruggegeven.' };
}

// ---------------------------------------------------------------------------
// Terugdraaien
//
// Elke stap in de flow kan één stap terug. Zonder dit betekende één verkeerde
// klik een ingreep in de database, en dat is precies wat deze app moest
// vervangen. Drie regels gelden overal:
//
// 1. Een stap die voorraad opnieuw inneemt (teruggebracht terugdraaien) doet dat
//    in dezelfde Serializable-transactie als de gewone flow, met dezelfde
//    voorraadcheck. Voorraad vrijgeven (goedkeuring terugdraaien) is altijd veilig.
// 2. Een geslaagde online betaling draai je hier niet terug: dat vraagt een
//    terugbetaling bij de provider. De actie weigert en zegt dat ook.
// 3. Elke terugdraaiing komt in de historiek, anders verdwijnt net het feit dat
//    je iets rechtgezet hebt.
// ---------------------------------------------------------------------------

/** Betalingen die een wijziging blokkeren: lopend of geslaagd. */
const BLOCKING_PAYMENT_STATUSES = ['CREATED', 'PENDING', 'SUCCEEDED'];

export async function reopenReservationAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { status: true, paidOfflineAt: true, payments: { select: { status: true } } },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'APPROVED' && reservation.status !== 'REJECTED') {
    return {
      ok: false,
      error: 'Enkel een goedgekeurde of afgewezen aanvraag kan terug op "aangevraagd".',
    };
  }
  if (reservation.paidOfflineAt) {
    return { ok: false, error: 'Draai eerst de betaling terug; daarna kan de goedkeuring terug.' };
  }
  if (reservation.payments.some((payment) => BLOCKING_PAYMENT_STATUSES.includes(payment.status))) {
    return {
      ok: false,
      error: 'Er loopt een online betaling voor deze aanvraag; die moet eerst afgehandeld worden.',
    };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { status: 'REQUESTED', paymentMode: null, decidedAt: null, decidedById: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: reservation.status,
    toStatus: 'REQUESTED',
    note: 'beslissing teruggedraaid',
    actorId: session.user.id,
  });
  await notifyReservation(
    reservationId,
    'REOPENED',
    reservation.status === 'APPROVED'
      ? 'De goedkeuring is ingetrokken; je aanvraag wacht opnieuw op een beslissing.'
      : 'De afwijzing is ingetrokken; je aanvraag wacht opnieuw op een beslissing.'
  );

  revalidateBeheer();
  return { ok: true, message: 'De aanvraag staat terug op "aangevraagd".' };
}

export async function undoPickedUpAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { status: true },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'PICKED_UP') {
    return { ok: false, error: 'Deze aanvraag staat niet op "afgehaald".' };
  }

  // Geen voorraadcheck nodig: APPROVED en PICKED_UP nemen allebei voorraad in.
  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { status: 'APPROVED', pickedUpAt: null, pickedUpById: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'PICKED_UP',
    toStatus: 'APPROVED',
    note: 'afhaling teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De afhaling is teruggedraaid.' };
}

/**
 * Terugbrengen terugdraaien. Dit is de zwaarste van de reeks: het materiaal komt
 * opnieuw uit de voorraad, en het flesserke-verbruik dat bij het terugbrengen
 * afgeboekt werd, moet terug op de plank. Beide in één transactie, met dezelfde
 * voorraadcheck als bij het goedkeuren; is de periode intussen volgeboekt, dan
 * gaat er niets door.
 */
export async function undoReturnedAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const outcome = await runSerializable(async (tx) => {
    const reservation = await tx.uitleenReservation.findUnique({
      where: { id: reservationId },
      include: {
        lines: { include: { item: { select: { quantity: true } } } },
        flesserkeLines: { include: { item: { select: { quantity: true } } } },
      },
    });
    if (!reservation) return { error: 'NOT_FOUND' as const };
    if (reservation.status !== 'RETURNED') return { error: 'NOT_RETURNED' as const };

    // Materiaal komt weer uit de voorraad zodra de aanvraag terug op PICKED_UP staat.
    const reserved = await reservedQuantities(tx, reservation.pickupDate, reservation.returnDate, {
      excludeReservationId: reservation.id,
    });
    for (const line of reservation.lines) {
      const available = line.item.quantity - (reserved.get(line.itemId) ?? 0);
      if (line.quantity > available) {
        return { error: 'NO_STOCK' as const, itemName: line.itemName };
      }
    }

    // Flesserke: het verbruik gaat terug naar de voorraad, maar de lijn neemt
    // ook weer plaats in. Per item optellen, want twee lijnen kunnen hetzelfde
    // item raken.
    const flReserved = await flesserkeReserved(tx, { excludeReservationId: reservation.id });
    const perItem = new Map<string, { stock: number; restored: number; needed: number; name: string }>();
    for (const line of reservation.flesserkeLines) {
      const entry = perItem.get(line.flesserkeItemId) ?? {
        stock: line.item.quantity,
        restored: 0,
        needed: 0,
        name: line.itemName,
      };
      entry.restored += line.quantity - (line.returnedQuantity ?? 0);
      entry.needed += line.quantity;
      perItem.set(line.flesserkeItemId, entry);
    }
    for (const [itemId, entry] of perItem) {
      const available = entry.stock + entry.restored - (flReserved.get(itemId) ?? 0) - entry.needed;
      if (available < 0) return { error: 'NO_STOCK' as const, itemName: entry.name };
    }

    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: { status: 'PICKED_UP', returnedAt: null, returnedById: null },
    });
    for (const line of reservation.flesserkeLines) {
      const consumed = line.quantity - (line.returnedQuantity ?? 0);
      await tx.uitleenFlesserkeLine.update({
        where: { id: line.id },
        data: { returnedQuantity: null },
      });
      // Terug op de oudste lading: het spiegelbeeld van het afboeken hierboven.
      if (consumed > 0) await restoreFlesserkeStock(tx, line.flesserkeItemId, consumed);
    }
    await writeAudit(tx, { reservationId }, {
      kind: 'STATUS_CHANGED',
      fromStatus: 'RETURNED',
      toStatus: 'PICKED_UP',
      note: 'terugbrengen teruggedraaid',
      actorId: session.user.id,
    });
    return { error: null };
  });

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome.error === 'NOT_RETURNED') {
    return { ok: false, error: 'Deze aanvraag staat niet op "teruggebracht".' };
  }
  if (outcome.error === 'NO_STOCK') {
    return {
      ok: false,
      error: `Terugdraaien kan niet: ${outcome.itemName} is intussen aan iemand anders toegewezen.`,
    };
  }

  revalidateBeheer();
  return { ok: true, message: 'Het terugbrengen is teruggedraaid; het materiaal staat weer uit.' };
}

export async function undoPaidOfflineAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { paidOfflineAt: true, payments: { select: { status: true } } },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (!reservation.paidOfflineAt) return { ok: false, error: 'Deze aanvraag staat niet als betaald.' };
  if (reservation.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Er is online betaald; terugbetalen loopt via de betaalprovider, niet via dit scherm.',
    };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { paidOfflineAt: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaling aan de balie teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De aanvraag staat weer als niet betaald.' };
}

export async function undoDepositReturnedAction(reservationId: string): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: { depositReturnedAt: true },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (!reservation.depositReturnedAt) {
    return { ok: false, error: 'De waarborg staat niet als teruggegeven.' };
  }

  await prisma.uitleenReservation.update({
    where: { id: reservationId },
    data: { depositReturnedAt: null },
  });
  await writeAudit(prisma, { reservationId }, {
    kind: 'PAYMENT_MARKED',
    note: 'waarborg teruggeven teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De waarborg staat weer open.' };
}

/**
 * Team-bewerking van een aanvraag. Mag REQUESTED en APPROVED bewerken (elke post
 * kiezen). Bij APPROVED loopt de save in dezelfde Serializable-transactie als het
 * goedkeuren en wordt de voorraad opnieuw gecheckt, zodat een APPROVED aanvraag
 * altijd door voorraad gedekt blijft.
 */
/**
 * Team-bewerking van een flesserke-aanvraag.
 *
 * Apart van {@link adminEditReservationAction}, want een flesserke-aanvraag heeft
 * geen materiaallijnen en de voorraadcheck is een andere: verbruiksgoed wordt
 * niet per periode gereserveerd maar in zijn geheel, tot het terugkomt.
 */
export async function adminEditFlesserkeReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  const session = await requireManage();

  const built = await buildReservationData({ ...input, lines: [] }, null);
  if (!built.ok) return built;

  const outcome = await runSerializable(
    async (tx): Promise<{ error: string | null; changes?: string[] }> => {
      const existing = await tx.uitleenReservation.findUnique({
        where: { id: reservationId },
        select: {
          status: true,
          paidOfflineAt: true,
          pickupDate: true,
          returnDate: true,
          pickupPart: true,
          returnPart: true,
          payments: { select: { status: true } },
          flesserkeLines: { select: { returnedQuantity: true, itemName: true, quantity: true } },
        },
      });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
        return { error: 'LOCKED' as const };
      }
      if (
        existing.paidOfflineAt ||
        existing.payments.some((payment) => ['CREATED', 'PENDING', 'SUCCEEDED'].includes(payment.status))
      ) {
        return { error: 'PAYMENT_LOCKED' as const };
      }
      // Een lijn waarvan het verbruik al afgeboekt is, mag je niet in aantal
      // wijzigen: de voorraad is dan al aangepast en het nieuwe aantal zou daar
      // niet meer bij passen. Draai eerst het terugbrengen terug.
      const settled = existing.flesserkeLines.find((line) => line.returnedQuantity !== null);
      if (settled) return { error: `SETTLED:${settled.itemName}` as const };

      // Enkel bij een goedgekeurde aanvraag neemt flesserke voorraad in; bij een
      // aanvraag die nog beslist moet worden, telt ze nog niet mee.
      if (existing.status === 'APPROVED') {
        const reserved = await flesserkeReserved(tx, { excludeReservationId: reservationId });
        const items = await tx.uitleenFlesserkeItem.findMany({
          where: { id: { in: built.flesserkeLineCreates.map((l) => l.flesserkeItemId) } },
          select: { id: true, quantity: true, name: true },
        });
        const byId = new Map(items.map((item) => [item.id, item]));
        for (const line of built.flesserkeLineCreates) {
          const item = byId.get(line.flesserkeItemId);
          const available = (item?.quantity ?? 0) - (reserved.get(line.flesserkeItemId) ?? 0);
          if (line.quantity > available) {
            return { error: `STOCK:${item?.name ?? line.itemName}` as const };
          }
        }
      }

      await tx.uitleenFlesserkeLine.deleteMany({ where: { reservationId } });
      await tx.uitleenReservation.update({
        where: { id: reservationId },
        data: { ...built.scalars, flesserkeLines: { create: built.flesserkeLineCreates } },
      });
      const changes = describeReservationChanges(
        {
          pickupDate: existing.pickupDate,
          returnDate: existing.returnDate,
          pickupPart: existing.pickupPart,
          returnPart: existing.returnPart,
          lines: existing.flesserkeLines,
        },
        {
          pickupDate: built.scalars.pickupDate,
          returnDate: built.scalars.returnDate,
          pickupPart: built.scalars.pickupPart,
          returnPart: built.scalars.returnPart,
          lines: built.flesserkeLineCreates,
        }
      );
      await writeAudit(tx, { reservationId }, {
        kind: 'EDITED',
        note: changes.length > 0 ? changes.join('; ') : 'aanvraagdetails aangepast',
        actorId: session.user.id,
      });
      return { error: null, changes };
    }
  );

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Aanvraag niet gevonden.' };
  if (outcome.error === 'LOCKED') return { ok: false, error: 'Deze aanvraag kan niet meer bewerkt worden.' };
  if (outcome.error === 'PAYMENT_LOCKED') {
    return {
      ok: false,
      error: 'Deze aanvraag heeft een actieve of voltooide betaling en kan niet meer gewijzigd worden.',
    };
  }
  if (outcome.error?.startsWith('SETTLED:')) {
    return {
      ok: false,
      error: `"${outcome.error.slice(8)}" is al afgeboekt bij het terugbrengen. Draai het terugbrengen eerst terug.`,
    };
  }
  if (outcome.error?.startsWith('STOCK:')) {
    return { ok: false, error: `Onvoldoende voorraad voor "${outcome.error.slice(6)}".` };
  }

  await notifyReservation(reservationId, 'EDITED', outcome.changes?.join('\n'));
  revalidateBeheer();
  revalidatePath('/flesserke');
  return { ok: true, message: 'Flesserke-aanvraag bijgewerkt.' };
}

/**
 * Wat er zou botsen als deze aanvraag naar die datums verschuift, zonder iets op
 * te slaan. Voor de knop "past dit?" naast de datumvelden: schuiven zonder te
 * weten of het helpt, is twee keer schuiven.
 */
export async function previewShiftAction(
  reservationId: string,
  pickup: string,
  ret: string
): Promise<{ ok: true; fits: boolean; detail: string } | { ok: false; error: string }> {
  await requireManage();
  const pickupDate = parseDateOnly(pickup);
  const returnDate = parseDateOnly(ret);
  if (!pickupDate || !returnDate) return { ok: false, error: 'Kies twee geldige datums.' };
  if (returnDate < pickupDate) {
    return { ok: false, error: 'De terugbrengdatum ligt voor de afhaaldatum.' };
  }
  const conflicts = await reservationConflicts(reservationId, { pickupDate, returnDate });
  if (conflicts.length === 0) return { ok: true, fits: true, detail: 'Past in die periode.' };
  return {
    ok: true,
    fits: false,
    detail: conflicts
      .map((conflict) => `${conflict.itemName}: ${conflict.requested} gevraagd, ${conflict.available} vrij`)
      .join('; '),
  };
}

/**
 * Enkel de afhaal- en terugbrengdatum van een aanvraag verzetten.
 *
 * Voor twee aanvragen die om hetzelfde materiaal vechten: vaak passen ze samen
 * na een dag schuiven, en dan is de tweede afwijzen te grof. Dezelfde ingreep als
 * bij vervoer (V5), maar op dagen in plaats van uren.
 *
 * Een goedgekeurde aanvraag mag niet naar een periode schuiven waar ze niet past;
 * anders schuif je het probleem naar een derde aanvraag. Een aanvraag die nog
 * beslist moet worden, mag wél in een conflict blijven staan: dat is precies wat
 * M2 mogelijk maakt, en de harde check bij goedkeuren blijft.
 */
export async function shiftReservationDatesAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const reservationId = String(formData.get('reservationId') ?? '');
  const pickupDate = parseDateOnly(String(formData.get('pickupDate') ?? ''));
  const returnDate = parseDateOnly(String(formData.get('returnDate') ?? ''));
  if (!pickupDate || !returnDate) return saveError('DATE_INVALID');
  if (returnDate < pickupDate) return saveError('DATE_ORDER');

  const outcome = await runSerializable(
    async (tx): Promise<{ error: string | null; note?: string }> => {
      const existing = await tx.uitleenReservation.findUnique({
        where: { id: reservationId },
        select: {
          status: true,
          pickupDate: true,
          returnDate: true,
          lines: { select: { itemId: true, itemName: true, quantity: true } },
        },
      });
      if (!existing) return { error: 'NOT_FOUND' };
      if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
        return { error: 'LOCKED' };
      }
      if (
        existing.pickupDate.getTime() === pickupDate.getTime() &&
        existing.returnDate.getTime() === returnDate.getTime()
      ) {
        return { error: 'UNCHANGED' };
      }

      if (existing.status === 'APPROVED') {
        const reserved = await reservedQuantities(tx, pickupDate, returnDate, {
          excludeReservationId: reservationId,
        });
        const items = await tx.uitleenItem.findMany({
          where: { id: { in: existing.lines.map((line) => line.itemId) } },
          select: { id: true, quantity: true, name: true },
        });
        const byId = new Map(items.map((item) => [item.id, item]));
        for (const line of existing.lines) {
          const item = byId.get(line.itemId);
          const available = (item?.quantity ?? 0) - (reserved.get(line.itemId) ?? 0);
          if (line.quantity > available) return { error: `STOCK:${item?.name ?? line.itemName}` };
        }
      }

      await tx.uitleenReservation.update({
        where: { id: reservationId },
        data: { pickupDate, returnDate },
      });
      const changes = describeReservationChanges(
        { pickupDate: existing.pickupDate, returnDate: existing.returnDate, lines: existing.lines },
        { pickupDate, returnDate, lines: existing.lines }
      );
      const note = changes.join('; ');
      await writeAudit(tx, { reservationId }, {
        kind: 'EDITED',
        note,
        actorId: session.user.id,
      });
      return { error: null, note };
    }
  );

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'LOCKED') return saveError('LOCKED');
  if (outcome.error === 'UNCHANGED') return saveError('UNCHANGED');
  if (outcome.error?.startsWith('STOCK:')) {
    return saveError('STOCK', `"${outcome.error.slice(6)}" past niet in de nieuwe periode.`);
  }

  // De aanvrager hoort dit te weten zonder in te loggen; bij een conflict tussen
  // twee aanvragen verschuif je ze allebei, en dan krijgt elke aanvrager de mail
  // over zijn eigen aanvraag.
  await notifyReservation(reservationId, 'EDITED', outcome.note);
  revalidateBeheer();
  return saveOk();
}

export async function adminEditReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  const session = await requireManage();

  // Team-editor beheert de materiaallijnen; flesserke loopt via een eigen flow.
  const built = await buildReservationData({ ...input, flesserkeLines: [] }, null);
  if (!built.ok) return built;

  // Status, betaalstatus, voorraadcontrole en write gebeuren in één serializable
  // transactie. Zo kan een gelijktijdige goedkeuring/betaling nooit tussen de
  // controle en de edit komen, en een validatiefout commit geen halve edit.
  const outcome = await runSerializable(
    async (tx): Promise<{ error: string | null; changes?: string[] }> => {
      const existing = await tx.uitleenReservation.findUnique({
        where: { id: reservationId },
        select: {
          status: true,
          paidOfflineAt: true,
          pickupDate: true,
          returnDate: true,
          pickupPart: true,
          returnPart: true,
          payments: { select: { status: true } },
          lines: {
            select: {
              itemId: true,
              itemName: true,
              quantity: true,
              preparedAt: true,
              preparedById: true,
            },
          },
        },
      });
      if (!existing) return { error: 'NOT_FOUND' };
      if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
        return { error: 'LOCKED' };
      }
      if (
        existing.paidOfflineAt ||
        existing.payments.some((payment) =>
          ['CREATED', 'PENDING', 'SUCCEEDED'].includes(payment.status),
        )
      ) {
        return { error: 'PAYMENT_LOCKED' };
      }

      if (existing.status === 'APPROVED') {
        const reserved = await reservedQuantities(tx, built.scalars.pickupDate, built.scalars.returnDate, {
          excludeReservationId: reservationId,
        });
        const items = await tx.uitleenItem.findMany({
          where: { id: { in: built.lineCreates.map((l) => l.itemId) } },
          select: { id: true, quantity: true, name: true },
        });
        const byId = new Map(items.map((i) => [i.id, i]));
        for (const line of built.lineCreates) {
          const item = byId.get(line.itemId);
          const available = (item?.quantity ?? 0) - (reserved.get(line.itemId) ?? 0);
          if (line.quantity > available) {
            return { error: `STOCK:${item?.name ?? line.itemName}` };
          }
        }
      }

      // De lijnen worden vervangen, dus ook een vinkje van het klaarzetten zou
      // verdwijnen. Bij een lijn die niet veranderde (zelfde item, zelfde aantal)
      // is dat verkeerd: het team dat enkel de datum verschoof, zou de halve
      // loods opnieuw moeten afvinken. Wijzigt het aantal wél, dan klopt het
      // vinkje niet meer en valt het bewust weg.
      const preparedBefore = new Map(
        existing.lines
          .filter((line) => line.preparedAt !== null)
          .map((line) => [`${line.itemId}:${line.quantity}`, line])
      );
      await tx.uitleenReservationLine.deleteMany({ where: { reservationId } });
      await tx.uitleenReservation.update({
        where: { id: reservationId },
        data: {
          ...built.scalars,
          lines: {
            create: built.lineCreates.map((line) => {
              const kept = preparedBefore.get(`${line.itemId}:${line.quantity}`);
              return kept
                ? { ...line, preparedAt: kept.preparedAt, preparedById: kept.preparedById }
                : line;
            }),
          },
        },
      });
      // Wat er veranderde, niet hoeveel lijnen er overblijven: dit gaat zowel naar
      // de historiek als naar de mail aan de aanvrager.
      const changes = describeReservationChanges(
        {
          pickupDate: existing.pickupDate,
          returnDate: existing.returnDate,
          pickupPart: existing.pickupPart,
          returnPart: existing.returnPart,
          lines: existing.lines,
        },
        {
          pickupDate: built.scalars.pickupDate,
          returnDate: built.scalars.returnDate,
          pickupPart: built.scalars.pickupPart,
          returnPart: built.scalars.returnPart,
          lines: built.lineCreates,
        }
      );
      await writeAudit(tx, { reservationId }, {
        kind: 'EDITED',
        note: changes.length > 0 ? changes.join('; ') : 'aanvraagdetails aangepast',
        actorId: session.user.id,
      });
      return { error: null, changes };
    }
  );

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome.error === 'LOCKED') {
    return { ok: false, error: 'Deze aanvraag kan niet meer bewerkt worden.' };
  }
  if (outcome.error === 'PAYMENT_LOCKED') {
    return { ok: false, error: 'Deze aanvraag heeft een actieve of voltooide betaling en kan niet meer gewijzigd worden.' };
  }
  if (outcome.error?.startsWith('STOCK:')) {
    return { ok: false, error: `Onvoldoende voorraad voor "${outcome.error.slice(6)}".` };
  }
  await notifyReservation(reservationId, 'EDITED', outcome.changes?.join('\n'));
  revalidateBeheer();
  return { ok: true, message: 'Aanvraag bijgewerkt.' };
}

// ---------------------------------------------------------------------------
// Vervoer (kar / auto / bakfiets)
// ---------------------------------------------------------------------------

/**
 * De rit aanmaken die de levering van een materiaalaanvraag is.
 *
 * "Levering nodig" was tot nu toe enkel een vinkje op de aanvraag. Het maakte
 * geen rit aan, stond niet in de aanvragenlijst en niet in de mail, en kwam dus
 * nooit in het vervoerbeheer terecht: wie die ene regel op de detailpagina niet
 * opmerkte, wist van niets. Nu zet Logistiek ze hier door.
 *
 * Drie keuzes die niet vanzelf spreken:
 *
 * - **De rit komt op naam van de aanvrager**, niet van wie ze aanmaakt. Zo ziet
 *   het lid ze bij "Mijn aanvragen" staan en gaan de mails erover naar hem, net
 *   als bij een rit die hij zelf aanvroeg.
 * - **Ze wordt AANGEVRAAGD en niet meteen goedgekeurd.** De goedkeuring doet de
 *   botsingscontrole per voertuig, kiest de betaalwijze en wijst de chauffeur
 *   toe; die overslaan zou een tweede, zwakkere beslisweg maken. Het is dus één
 *   klik extra, in ruil voor dezelfde controle als elke andere rit.
 * - **Het evenement volgt de aanvraag.** Hangt de aanvraag onder een koepel (A8),
 *   dan hangt de rit daar ook onder, zodat beide op de evenementpagina staan.
 */
export async function createTransportForReservationAction(
  reservationId: string,
  input: TransportFormInput
): Promise<ActionResult> {
  const session = await requireManage();

  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      userId: true,
      eventId: true,
      requesterType: true,
      groupId: true,
      requesterName: true,
    },
  });
  if (!reservation) return { ok: false, error: 'Aanvraag niet gevonden.' };

  const built = await buildTransportBookings(input, {
    userId: reservation.userId,
    eventId: reservation.eventId,
    requesterType: reservation.requesterType,
    groupId: reservation.groupId,
    requesterName: reservation.requesterName,
    reservationId: reservation.id,
  });
  if (!built.ok) return { ok: false, error: built.error };

  await prisma.$transaction(async (tx) => {
    await tx.uitleenTransportBooking.createMany({ data: built.bookings });
    await writeAudit(tx, { reservationId: reservation.id }, {
      kind: 'NOTE',
      note: built.roundTrip
        ? 'Levering: heen- en terugrit aangemaakt bij vervoer.'
        : 'Levering: rit aangemaakt bij vervoer.',
      actorId: session.user.id,
    });
  });

  revalidateBeheer();
  return {
    ok: true,
    message: built.roundTrip
      ? 'Heen- en terugrit aangemaakt. Keur ze goed bij Vervoer.'
      : 'Rit aangemaakt. Keur ze goed bij Vervoer.',
  };
}

/**
 * De goedgekeurde rit van hetzelfde voertuig waarmee dit tijdvenster botst, of
 * null. Geeft de rit zelf terug en niet enkel een boolean: "voertuig bezet"
 * zegt niet waarheen je moet schuiven, en dat is precies wat het team wil weten.
 */
async function overlappingBooking(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  startAt: Date,
  endAt: Date,
  excludeIds: string[]
) {
  const others = await tx.uitleenTransportBooking.findMany({
    where: { vehicleId, status: 'APPROVED', id: { notIn: excludeIds } },
    select: { id: true, startAt: true, endAt: true, eventName: true, purpose: true },
  });
  return others.find((other) => rangesOverlap(startAt, endAt, other.startAt, other.endAt)) ?? null;
}

/** "de rit van Feest op za 12 sep 14:00-18:00", voor in een foutmelding. */
function bookingLabel(booking: {
  eventName: string | null;
  purpose: string;
  startAt: Date;
  endAt: Date;
}): string {
  const what = booking.eventName?.trim() || booking.purpose;
  return `de rit van ${what} op ${formatDateTime(booking.startAt)} tot ${formatDateTime(booking.endAt)}`;
}

/**
 * Goedkeuren, met de mogelijkheid de uren te verschuiven.
 *
 * Twee aanvragen voor dezelfde kar op dezelfde dag passen vaak samen na een
 * halfuur schuiven; voordien kon het team enkel goedkeuren of afwijzen. Het
 * formulier draagt per rit een `startAt-<id>` en `endAt-<id>`; wat er niet in
 * staat, blijft zoals aangevraagd.
 *
 * Een heen-en-terugaanvraag (`tripGroupId`) wordt in haar geheel beslist: de
 * heenrit goedkeuren en de terugrit laten hangen, levert een aanvrager op die
 * niet meer thuisgeraakt.
 */
export async function approveTransportAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireManage();

  const bookingId = String(formData.get('bookingId') ?? '');
  const paymentMode = String(formData.get('paymentMode') ?? '');
  const driverId = String(formData.get('driverId') ?? '').trim();
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (paymentMode !== 'ONLINE' && paymentMode !== 'OFFLINE') return saveError('MODE_REQUIRED');
  // De keuzelijst toont enkel chauffeurs, maar een formulier is te vervalsen; en
  // een toegewezen rit is meteen ook leestoegang tot die rit ("Mijn ritten").
  if (driverId && !(await isDriver(driverId))) return saveError('NOT_A_DRIVER');

  const outcome = await runSerializable(
    async (
      tx
    ): Promise<{ error: string | null; detail?: string; legIds?: string[]; shifts?: string[] }> => {
      const booking = await tx.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
      if (!booking) return { error: 'NOT_FOUND' as const };

      const legs = booking.tripGroupId
        ? await tx.uitleenTransportBooking.findMany({
            where: { tripGroupId: booking.tripGroupId },
            orderBy: { startAt: 'asc' },
          })
        : [booking];
      if (legs.some((leg) => leg.status !== 'REQUESTED')) return { error: 'NOT_REQUESTED' as const };

      const groupIds = legs.map((leg) => leg.id);
      const planned: Array<{ leg: (typeof legs)[number]; startAt: Date; endAt: Date }> = [];

      for (const leg of legs) {
        const startRaw = String(formData.get(`startAt-${leg.id}`) ?? '').trim();
        const endRaw = String(formData.get(`endAt-${leg.id}`) ?? '').trim();
        const startAt = startRaw ? parseBrusselsDateTime(startRaw) : leg.startAt;
        const endAt = endRaw ? parseBrusselsDateTime(endRaw) : leg.endAt;
        if (!startAt || !endAt) return { error: 'TIME_INVALID' as const };
        if (endAt <= startAt) return { error: 'TIME_ORDER' as const };
        if (!isOnQuarterHour(startAt) || !isOnQuarterHour(endAt)) {
          return { error: 'TIME_QUARTER' as const };
        }
        planned.push({ leg, startAt, endAt });
      }

      // Per voertuig: geen twee goedgekeurde ritten op hetzelfde moment. De
      // andere helft van dezelfde aanvraag telt niet mee als conflict met
      // zichzelf, maar mag wel niet over de eigen heenrit vallen.
      for (const [index, entry] of planned.entries()) {
        const clash = await overlappingBooking(
          tx,
          entry.leg.vehicleId,
          entry.startAt,
          entry.endAt,
          groupIds
        );
        if (clash) return { error: 'OVERLAP' as const, detail: bookingLabel(clash) };
        const sibling = planned.find(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.leg.vehicleId === entry.leg.vehicleId &&
            rangesOverlap(entry.startAt, entry.endAt, other.startAt, other.endAt)
        );
        if (sibling) return { error: 'SELF_OVERLAP' as const };
      }

      const shifts: string[] = [];
      for (const { leg, startAt, endAt } of planned) {
        const shifted = startAt.getTime() !== leg.startAt.getTime() || endAt.getTime() !== leg.endAt.getTime();
        await tx.uitleenTransportBooking.update({
          where: { id: leg.id },
          data: {
            status: 'APPROVED',
            startAt,
            endAt,
            paymentMode,
            driverId: driverId || null,
            adminNote: adminNote || null,
            // Prijs definitief maken volgens de gesnapshotte tariefmodus. Blijft null
            // voor per-km-ritten: die prijs wordt pas bij afronden gekend.
            priceCents: transportPriceCents({
              pricingMode: leg.pricingMode,
              rateCents: leg.rateCents,
              startAt,
              endAt,
            }),
            decidedAt: new Date(),
            decidedById: session.user.id,
          },
        });
        await writeAudit(tx, { transportBookingId: leg.id }, {
          kind: 'STATUS_CHANGED',
          fromStatus: leg.status,
          toStatus: 'APPROVED',
          note: paymentMode === 'ONLINE' ? 'online betalen' : 'betalen aan de balie',
          actorId: session.user.id,
        });
        // Verschoven uren zijn een wijziging aan de aanvraag: die hoort apart in
        // de historiek, want de nieuwe uren staan straks als "de" uren op de rit.
        if (shifted) {
          const shift = `Uren verschoven bij goedkeuring: ${formatDateTime(leg.startAt)} tot ${formatDateTime(leg.endAt)} werd ${formatDateTime(startAt)} tot ${formatDateTime(endAt)}`;
          shifts.push(shift);
          await writeAudit(tx, { transportBookingId: leg.id }, {
            kind: 'EDITED',
            note: shift,
            actorId: session.user.id,
          });
        }
      }
      return { error: null, legIds: groupIds, shifts };
    }
  );

  if (outcome.error === 'NOT_FOUND') return saveError('NOT_FOUND');
  if (outcome.error === 'NOT_REQUESTED') return saveError('NOT_REQUESTED');
  if (outcome.error === 'TIME_INVALID') return saveError('TIME_INVALID');
  if (outcome.error === 'TIME_ORDER') return saveError('TIME_ORDER');
  if (outcome.error === 'TIME_QUARTER') return saveError('TIME_QUARTER');
  if (outcome.error === 'SELF_OVERLAP') return saveError('SELF_OVERLAP');
  if (outcome.error === 'OVERLAP') {
    return saveError('OVERLAP', `Botst met ${outcome.detail}. Verschuif de uren of wijs af.`);
  }

  // Zijn de uren verschoven, dan is dat het nieuws; anders volstaat de betaalwijze.
  await notifyTransport(
    outcome.legIds ?? [bookingId],
    'APPROVED',
    outcome.shifts && outcome.shifts.length > 0
      ? outcome.shifts.join('\n')
      : paymentMode === 'ONLINE'
        ? 'Betalen gebeurt online; je vindt de betaalknop bij je rit.'
        : 'Betalen gebeurt aan de balie.'
  );

  revalidateBeheer();
  return saveOk();
}

export async function rejectTransportAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const bookingId = String(formData.get('bookingId') ?? '');
  const adminNote = String(formData.get('adminNote') ?? '').trim();
  if (!adminNote) return saveError('NOTE_REQUIRED');

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return saveError('NOT_FOUND');

  // Net als bij goedkeuren: een heen-en-terugaanvraag wijs je in haar geheel af.
  const legs = booking.tripGroupId
    ? await prisma.uitleenTransportBooking.findMany({ where: { tripGroupId: booking.tripGroupId } })
    : [booking];
  if (legs.some((leg) => leg.status !== 'REQUESTED')) return saveError('NOT_REQUESTED');

  for (const leg of legs) {
    await prisma.uitleenTransportBooking.update({
      where: { id: leg.id },
      data: { status: 'REJECTED', adminNote, decidedAt: new Date(), decidedById: session.user.id },
    });
    await writeAudit(prisma, { transportBookingId: leg.id }, {
      kind: 'STATUS_CHANGED',
      fromStatus: leg.status,
      toStatus: 'REJECTED',
      note: `reden: ${adminNote}`,
      actorId: session.user.id,
    });
  }
  await notifyTransport(
    legs.map((leg) => leg.id),
    'REJECTED',
    adminNote
  );

  revalidateBeheer();
  return saveOk();
}

/** Chauffeur toewijzen of wijzigen; kan op elk moment voor de rit afgerond is. */
export async function assignDriverAction(bookingId: string, driverId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status === 'REJECTED' || booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return { ok: false, error: 'Voor deze rit kan je geen chauffeur meer toewijzen.' };
  }
  if (driverId && !(await isDriver(driverId))) {
    return { ok: false, error: 'Deze persoon staat niet in de chauffeurslijst.' };
  }

  const driver = driverId
    ? await prisma.user.findUnique({ where: { id: driverId }, select: { name: true } })
    : null;

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { driverId: driverId || null },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'EDITED',
    note: driver ? `chauffeur: ${driver.name}` : 'chauffeur verwijderd',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: driverId ? 'Chauffeur toegewezen.' : 'Chauffeur verwijderd.' };
}

/** Voertuig wisselen: tarief opnieuw snapshotten en de prijs herberekenen. */
export async function changeVehicleAction(bookingId: string, vehicleId: string): Promise<ActionResult> {
  const session = await requireManage();

  const outcome = await runSerializable(
    async (tx): Promise<{ error: string | null; vehicleName?: string }> => {
      const booking = await tx.uitleenTransportBooking.findUnique({
        where: { id: bookingId },
        include: { payments: { select: { status: true } } },
      });
      if (!booking) return { error: 'NOT_FOUND' as const };
      if (booking.status === 'REJECTED' || booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
        return { error: 'LOCKED' as const };
      }
      if (
        booking.paidOfflineAt ||
        booking.payments.some((payment) =>
          ['CREATED', 'PENDING', 'SUCCEEDED'].includes(payment.status),
        )
      ) {
        return { error: 'PAYMENT_LOCKED' as const };
      }
      const vehicle = await tx.uitleenVehicle.findFirst({ where: { id: vehicleId, active: true } });
      if (!vehicle) return { error: 'NO_VEHICLE' as const };

      if (
        booking.status === 'APPROVED' &&
        (await overlappingBooking(tx, vehicle.id, booking.startAt, booking.endAt, [booking.id]))
      ) {
        return { error: 'OVERLAP' as const };
      }

      const priceCents =
        booking.status === 'APPROVED'
          ? transportPriceCents({
              pricingMode: vehicle.pricingMode,
              rateCents: vehicle.rateCents,
              startAt: booking.startAt,
              endAt: booking.endAt,
            })
          : null;

      await tx.uitleenTransportBooking.update({
        where: { id: booking.id },
        data: { vehicleId: vehicle.id, pricingMode: vehicle.pricingMode, rateCents: vehicle.rateCents, priceCents },
      });
      await writeAudit(tx, { transportBookingId: booking.id }, {
        kind: 'EDITED',
        note: `voertuig: ${vehicle.nameNl}`,
        actorId: session.user.id,
      });
      return { error: null, vehicleName: vehicle.nameNl };
    }
  );

  if (outcome.error === 'NOT_FOUND') return { ok: false, error: 'Rit niet gevonden.' };
  if (outcome.error === 'LOCKED') return { ok: false, error: 'Voor deze rit kan je het voertuig niet meer wisselen.' };
  if (outcome.error === 'NO_VEHICLE') return { ok: false, error: 'Voertuig niet gevonden.' };
  if (outcome.error === 'OVERLAP') return { ok: false, error: 'Dat voertuig is al geboekt op dat moment.' };
  if (outcome.error === 'PAYMENT_LOCKED') {
    return { ok: false, error: 'Deze rit heeft een actieve of voltooide betaling en kan niet meer gewijzigd worden.' };
  }

  await notifyTransport([bookingId], 'EDITED', `Voertuig gewijzigd naar ${outcome.vehicleName}.`);
  revalidateBeheer();
  return { ok: true, message: 'Voertuig gewijzigd.' };
}

/** Rit afronden; voor per-km-voertuigen voer je de kilometers in en wordt de prijs berekend. */
export async function completeTransportAction(bookingId: string, kilometersRaw?: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'APPROVED') {
    return { ok: false, error: 'Enkel een goedgekeurde rit kan afgerond worden.' };
  }

  let kilometers: number | null = booking.kilometers;
  let priceCents: number | null = booking.priceCents;
  if (booking.pricingMode === 'PER_KM') {
    const parsed = Number.parseInt(String(kilometersRaw ?? '').trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'Vul het aantal gereden kilometers in.' };
    }
    kilometers = parsed;
    priceCents = parsed * booking.rateCents;
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      kilometers,
      priceCents,
      completedAt: new Date(),
      completedById: session.user.id,
    },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'APPROVED',
    toStatus: 'COMPLETED',
    note: kilometers !== null ? `${kilometers} km` : null,
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Rit afgerond.' };
}

export async function markTransportPaidOfflineAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.paidOfflineAt) return { ok: false, error: 'Al gemarkeerd als betaald.' };

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { paidOfflineAt: new Date() },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaald aan de balie',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'Gemarkeerd als betaald.' };
}

export async function reopenTransportAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    include: { payments: { select: { status: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'APPROVED' && booking.status !== 'REJECTED') {
    return { ok: false, error: 'Enkel een goedgekeurde of afgewezen rit kan terug op "aangevraagd".' };
  }
  if (booking.paidOfflineAt) {
    return { ok: false, error: 'Draai eerst de betaling terug; daarna kan de goedkeuring terug.' };
  }
  if (booking.payments.some((payment) => BLOCKING_PAYMENT_STATUSES.includes(payment.status))) {
    return { ok: false, error: 'Er loopt een online betaling voor deze rit.' };
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: {
      status: 'REQUESTED',
      paymentMode: null,
      decidedAt: null,
      decidedById: null,
      // Terug naar de prijsindicatie van de aanvraag; per km blijft ze onbekend.
      priceCents: transportPriceCents({
        pricingMode: booking.pricingMode,
        rateCents: booking.rateCents,
        startAt: booking.startAt,
        endAt: booking.endAt,
      }),
    },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: booking.status,
    toStatus: 'REQUESTED',
    note: 'beslissing teruggedraaid',
    actorId: session.user.id,
  });
  await notifyTransport(
    [bookingId],
    'REOPENED',
    booking.status === 'APPROVED'
      ? 'De goedkeuring is ingetrokken; je rit wacht opnieuw op een beslissing.'
      : 'De afwijzing is ingetrokken; je rit wacht opnieuw op een beslissing.'
  );

  revalidateBeheer();
  return { ok: true, message: 'De rit staat terug op "aangevraagd".' };
}

/**
 * Afronden terugdraaien. De rit wordt weer goedgekeurd en de kilometers gaan
 * leeg: wie een afronding terugdraait, doet dat meestal net omdat de km fout
 * stonden, en dan moet het afrondformulier ze opnieuw vragen.
 */
export async function undoCompleteTransportAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    include: { payments: { select: { status: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'COMPLETED') return { ok: false, error: 'Deze rit is niet afgerond.' };
  if (booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Deze rit is online betaald; terugbetalen loopt via de betaalprovider.',
    };
  }

  const perKm = booking.pricingMode === 'PER_KM';
  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: {
      status: 'APPROVED',
      completedAt: null,
      completedById: null,
      kilometers: perKm ? null : booking.kilometers,
      priceCents: perKm ? null : booking.priceCents,
    },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'STATUS_CHANGED',
    fromStatus: 'COMPLETED',
    toStatus: 'APPROVED',
    note: perKm ? 'afronding teruggedraaid; kilometers gewist' : 'afronding teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De afronding is teruggedraaid.' };
}

export async function undoTransportPaidOfflineAction(bookingId: string): Promise<ActionResult> {
  const session = await requireManage();

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    include: { payments: { select: { status: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (!booking.paidOfflineAt) return { ok: false, error: 'Deze rit staat niet als betaald.' };
  if (booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Er is online betaald; terugbetalen loopt via de betaalprovider, niet via dit scherm.',
    };
  }

  await prisma.uitleenTransportBooking.update({
    where: { id: bookingId },
    data: { paidOfflineAt: null },
  });
  await writeAudit(prisma, { transportBookingId: bookingId }, {
    kind: 'PAYMENT_MARKED',
    note: 'betaling aan de balie teruggedraaid',
    actorId: session.user.id,
  });

  revalidateBeheer();
  return { ok: true, message: 'De rit staat weer als niet betaald.' };
}

// ---------------------------------------------------------------------------
// Chauffeurs
// ---------------------------------------------------------------------------

/**
 * Lid zoeken voor de chauffeurspicker. Een server action i.p.v. een API-route:
 * de picker leeft in het beheer, dus `requireManage` is de enige poort die we
 * nodig hebben (en we moeten geen aparte route beveiligen).
 */
export async function searchDriverCandidatesAction(query: string): Promise<DriverCandidate[]> {
  await requireManage();
  return searchDriverCandidates(query);
}

/** Chauffeur toevoegen aan de pool, gekozen uit de leden van vtk.be. */
export async function addDriverAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const userId = String(formData.get('userId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!userId) return saveError('USER_REQUIRED');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, active: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return saveError('NOT_FOUND');
  if (!user.active) return saveError('INACTIVE');

  // Al chauffeur via de post: dan voegt een rij hier niets toe, en de melding
  // legt uit waarom de naam toch al in de keuzelijst staat.
  const inPost = await prisma.groupMembership.count({
    where: { userId, year: currentWorkingYear(), group: { code: 'LOGISTIEK' } },
  });
  if (inPost > 0) return saveError('IN_POST');

  const existing = await prisma.uitleenDriver.count({ where: { userId } });
  if (existing > 0) return saveError('ALREADY_DRIVER');

  await prisma.uitleenDriver.create({
    data: { userId, note: note || null, addedById: session.user.id },
  });

  revalidateBeheer();
  return saveOk();
}

/** Notitie bij een chauffeur bewerken. */
export async function saveDriverNoteAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const driverRowId = String(formData.get('driverRowId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!driverRowId) return saveError('NOT_FOUND');

  const updated = await prisma.uitleenDriver.updateMany({
    where: { id: driverRowId },
    data: { note: note || null },
  });
  if (updated.count === 0) return saveError('NOT_FOUND');

  revalidateBeheer();
  return saveOk();
}

/**
 * Zet of wist de karvlag van een chauffeur.
 *
 * Werkt op `userId` en niet op de rij, want iemand uit de post Logistiek heeft
 * pas een `UitleenDriver`-rij zodra je hier iets aanvinkt; die rij wordt dan
 * aangemaakt. Gevolg om te kennen: verlaat die persoon later de post, dan blijft
 * hij via die rij in de chauffeurslijst staan (en verschijnt hij onder "zelf
 * toegevoegd", waar je hem kan weghalen).
 */
export async function setDriverVanAction(
  userId: string,
  canDriveVan: boolean
): Promise<ActionResult> {
  await requireManage();

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return { ok: false, error: 'Dit lid bestaat niet (meer) op vtk.be.' };

  await prisma.uitleenDriver.upsert({
    where: { userId },
    update: { canDriveVan },
    create: { userId, canDriveVan },
  });

  revalidateBeheer();
  return {
    ok: true,
    message: canDriveVan ? 'Rijdt ook met de kar.' : 'Rijdt niet met de kar.',
  };
}

/**
 * Chauffeur uit de pool halen. Ritten die al aan deze persoon toegewezen zijn
 * blijven bewust staan: de rit is gereden of gepland, en de naam wissen zou de
 * historiek en de planning stukmaken. Wel verdwijnt de keuze voor nieuwe ritten,
 * en ziet de persoon "Mijn ritten" enkel nog zolang er ritten aan hangen.
 */
export async function removeDriverAction(driverRowId: string): Promise<ActionResult> {
  await requireManage();

  const deleted = await prisma.uitleenDriver.deleteMany({ where: { id: driverRowId } });
  if (deleted.count === 0) return { ok: false, error: 'Deze chauffeur staat niet (meer) in de lijst.' };

  revalidateBeheer();
  return { ok: true, message: 'Chauffeur uit de lijst gehaald.' };
}

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

const PRICING_MODES = ['FREE', 'PER_HOUR', 'PER_KM', 'FLAT'] as const;
type PricingMode = (typeof PRICING_MODES)[number];

export async function saveVehicleAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const nameNl = String(formData.get('nameNl') ?? '').trim();
  const nameEn = String(formData.get('nameEn') ?? '').trim() || nameNl;
  const description = String(formData.get('description') ?? '').trim();
  const modeRaw = String(formData.get('pricingMode') ?? 'FREE').trim();
  const pricingMode: PricingMode = PRICING_MODES.includes(modeRaw as PricingMode)
    ? (modeRaw as PricingMode)
    : 'FREE';
  const rateCents = parseEuroToCents(formData.get('rate'));
  if (!nameNl) return saveError('NAME_REQUIRED');
  if (rateCents === null) return saveError('AMOUNT_INVALID');

  const data = {
    nameNl,
    nameEn,
    description: description || null,
    pricingMode,
    rateCents: pricingMode === 'FREE' ? 0 : rateCents,
    needsVanDriver: String(formData.get('needsVanDriver') ?? '') === 'on',
  };
  if (id) {
    await prisma.uitleenVehicle.update({ where: { id }, data });
  } else {
    // Nieuwe voertuigen: code afgeleid van de naam, uniek gemaakt.
    const base = nameNl.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'voertuig';
    let code = base;
    for (let i = 2; await prisma.uitleenVehicle.findUnique({ where: { code } }); i += 1) {
      code = `${base}-${i}`;
    }
    const count = await prisma.uitleenVehicle.count();
    await prisma.uitleenVehicle.create({ data: { ...data, code, sortIndex: count } });
  }

  revalidateBeheer();
  return saveOk();
}

export async function setVehicleActiveAction(vehicleId: string, active: boolean): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenVehicle.update({ where: { id: vehicleId }, data: { active } });
  revalidateBeheer();
  return { ok: true, message: active ? 'Voertuig terug beschikbaar.' : 'Voertuig gedeactiveerd.' };
}

const LOGISTIEK_SETTINGS_KEY = 'logistiek.settings';

export async function saveLogistiekSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const showRentPrices = String(formData.get('showRentPrices') ?? '') === 'on';
  const lastMinuteDays = Number.parseInt(String(formData.get('lastMinuteDays') ?? ''), 10);
  // Een bovengrens omdat "last minute" anders alles wordt en de badge niets meer zegt.
  if (!Number.isFinite(lastMinuteDays) || lastMinuteDays < 1 || lastMinuteDays > 90) {
    return saveError('LAST_MINUTE_INVALID');
  }
  const value = { showRentPrices, lastMinuteDays };
  await prisma.setting.upsert({
    where: { key: LOGISTIEK_SETTINGS_KEY },
    update: { value },
    create: { key: LOGISTIEK_SETTINGS_KEY, value },
  });
  revalidateBeheer();
  // Ook de ledenkant: de waarschuwing bij het aanvragen komt uit dezelfde instelling.
  revalidatePath('/materiaal');
  revalidatePath('/flesserke');
  return saveOk();
}

// ---------------------------------------------------------------------------
// Flesserke (verbruiksstock beheren)
// ---------------------------------------------------------------------------

export async function saveFlesserkeCategoryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const sortIndex = Number.parseInt(String(formData.get('sortIndex') ?? '0'), 10) || 0;
  if (!name) return saveError('NAME_REQUIRED');
  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const updated = await prisma.uitleenFlesserkeCategory.updateMany({
      where: expected ? { id, updatedAt: expected } : { id },
      data: { name, sortIndex },
    });
    if (updated.count === 0) return saveError('STALE');
  } else {
    await prisma.uitleenFlesserkeCategory.create({ data: { name, sortIndex } });
  }
  revalidateBeheer();
  return saveOk();
}

export async function saveFlesserkeItemAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const brand = String(formData.get('brand') ?? '').trim();
  const contentAmount = String(formData.get('contentAmount') ?? '').trim();
  const contentUnit = String(formData.get('contentUnit') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const quantity = Number.parseInt(String(formData.get('quantity') ?? ''), 10);
  const colruytUrl = String(formData.get('colruytUrl') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const locationShelf = String(formData.get('locationShelf') ?? '').trim();
  const locationRack = String(formData.get('locationRack') ?? '').trim();
  const expiryRaw = String(formData.get('expiryDate') ?? '').trim();

  if (!name) return saveError('NAME_REQUIRED');
  // Aantal en datum horen bij de eerste lading en staan enkel in het
  // toevoegformulier; bij het bewerken komen ze niet mee.
  if (!id && (!Number.isInteger(quantity) || quantity < 0)) return saveError('QUANTITY_INVALID');
  let expiryDate: Date | null = null;
  if (expiryRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryRaw)) return saveError('DATE_INVALID');
    expiryDate = new Date(`${expiryRaw}T00:00:00.000Z`);
  }

  // Aantal en vervaldatum staan op de ladingen, niet op het item: bij het
  // bewerken komen die velden dan ook niet mee, en de samenvatting op het item
  // wordt uit de batches herrekend.
  const data = {
    name,
    brand: brand || null,
    contentAmount: contentAmount || null,
    contentUnit: contentUnit || null,
    categoryId: categoryId || null,
    colruytUrl: colruytUrl || null,
    note: note || null,
    locationShelf: locationShelf || null,
    locationRack: locationRack || null,
  };
  if (id) {
    const expected = parseExpectedVersion(formData.get('expectedUpdatedAt'));
    const updated = await prisma.uitleenFlesserkeItem.updateMany({
      where: expected ? { id, updatedAt: expected } : { id },
      data,
    });
    if (updated.count === 0) return saveError('STALE');
  } else {
    // Een nieuw item begint met één lading: het aantal en de datum uit het
    // toevoegformulier. Verdere ladingen voeg je per item toe.
    await prisma.$transaction(async (tx) => {
      const created = await tx.uitleenFlesserkeItem.create({ data: { ...data, quantity: 0 } });
      await tx.uitleenFlesserkeBatch.create({
        data: { itemId: created.id, quantity, expiryDate },
      });
      await syncFlesserkeItemTotals(tx, created.id);
    });
  }
  revalidateBeheer();
  return saveOk();
}

/**
 * Eén lading opslaan (nieuw of bestaand). De voorraad van het item volgt daaruit.
 */
export async function saveFlesserkeBatchAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const id = String(formData.get('batchId') ?? '').trim();
  const itemId = String(formData.get('itemId') ?? '').trim();
  const quantity = Number.parseInt(String(formData.get('quantity') ?? ''), 10);
  const note = String(formData.get('note') ?? '').trim();
  const expiryRaw = String(formData.get('expiryDate') ?? '').trim();

  if (!itemId) return saveError('NOT_FOUND');
  if (!Number.isInteger(quantity) || quantity < 0) return saveError('QUANTITY_INVALID');
  let expiryDate: Date | null = null;
  if (expiryRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryRaw)) return saveError('DATE_INVALID');
    expiryDate = new Date(`${expiryRaw}T00:00:00.000Z`);
  }

  await prisma.$transaction(async (tx) => {
    if (id) {
      await tx.uitleenFlesserkeBatch.update({
        where: { id },
        data: { quantity, expiryDate, note: note || null },
      });
    } else {
      await tx.uitleenFlesserkeBatch.create({
        data: { itemId, quantity, expiryDate, note: note || null },
      });
    }
    await syncFlesserkeItemTotals(tx, itemId);
  });

  revalidateBeheer();
  return saveOk();
}

/** Een lading verwijderen; de voorraad van het item zakt met dat aantal. */
export async function deleteFlesserkeBatchAction(batchId: string): Promise<ActionResult> {
  await requireManage();
  const batch = await prisma.uitleenFlesserkeBatch.findUnique({
    where: { id: batchId },
    select: { itemId: true },
  });
  if (!batch) return { ok: false, error: 'Deze lading bestaat niet meer.' };

  await prisma.$transaction(async (tx) => {
    await tx.uitleenFlesserkeBatch.delete({ where: { id: batchId } });
    await syncFlesserkeItemTotals(tx, batch.itemId);
  });

  revalidateBeheer();
  return { ok: true, message: 'Lading verwijderd.' };
}

/**
 * Snelle voorraadbijstelling (wekelijkse upkeep) zonder het hele item te openen.
 *
 * Werkt enkel wanneer er één lading is; liggen er meerdere, dan is niet te weten
 * van welke er twee bij of af moeten, en zou de app die keuze verzinnen.
 */
export async function setFlesserkeItemActiveAction(itemId: string, active: boolean): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenFlesserkeItem.update({ where: { id: itemId }, data: { active } });
  revalidateBeheer();
  return { ok: true, message: active ? 'Terug in de lijst.' : 'Uit de lijst gehaald.' };
}

export async function deactivateFlesserkeCategoryAction(categoryId: string): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenFlesserkeCategory.update({ where: { id: categoryId }, data: { active: false } });
  revalidateBeheer();
  return { ok: true, message: 'Categorie uit de lijst gehaald.' };
}
