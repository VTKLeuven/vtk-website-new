'use server';

import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import { syncFlesserkeItemTotals } from '@/lib/uitleen-server';
import type { ActionResult } from '@/app/actions/uitleen';
import { parseExpectedVersion, revalidateBeheer } from './shared';

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
