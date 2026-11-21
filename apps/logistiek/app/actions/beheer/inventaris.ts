'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';
import { requireManage } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import { syncItemQuantityFromUnits } from '@/lib/uitleen-server';
import type { ActionResult } from '@/app/actions/uitleen';
import { parseEuroToCents, parseExpectedVersion, revalidateBeheer } from './shared';

// ---------------------------------------------------------------------------
// Inventaris
// ---------------------------------------------------------------------------

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
