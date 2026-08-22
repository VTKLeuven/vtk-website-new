'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { parseCollectEnGoMail } from '@/lib/collectengo/parse';
import { normalizeProductKey } from '@/lib/collectengo/match';
import { readMailSource } from '@/lib/collectengo/eml';
import { storeParsedOrder } from '@/lib/collectengo/store';
import { pollCollectEnGoMailbox } from '@/lib/collectengo/imap';
import { syncFlesserkeItemTotals } from '@/lib/uitleen-server';
import type { ActionResult } from './uitleen';

function revalidateCollectEnGo(orderId?: string) {
  revalidatePath('/beheer/collectengo');
  if (orderId) revalidatePath(`/beheer/collectengo/${orderId}`);
  revalidatePath('/beheer/flesserke');
  revalidatePath('/flesserke');
}

/** Nu de mailbox nakijken, zonder op de worker te wachten. */
export async function pollCollectEnGoAction(): Promise<ActionResult> {
  await requireManage();
  const result = await pollCollectEnGoMailbox();
  revalidateCollectEnGo();

  if (result.errors.length > 0 && result.created + result.replaced === 0) {
    return { ok: false, error: `Mails ophalen lukte niet: ${result.errors[0]}` };
  }
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} nieuwe bestelling(en)`);
  if (result.replaced > 0) parts.push(`${result.replaced} bijgewerkt`);
  if (result.skipped > 0) parts.push(`${result.skipped} al gekend`);
  return {
    ok: true,
    message: parts.length > 0 ? `Opgehaald: ${parts.join(', ')}.` : 'Geen nieuwe Collect&Go-mails gevonden.',
  };
}

/**
 * Een geplakte mail of een `.eml`-bestand inlezen.
 *
 * Vangnet naast de IMAP-ronde: de mail kwam op een privéadres toe, of de mailbox
 * is (nog) niet ingesteld.
 */
export async function importPastedMailAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const pasted = String(formData.get('mail') ?? '');
  const file = formData.get('file');
  let raw = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return saveError('FILE_TOO_LARGE');
    raw = await file.text();
  }
  if (!raw.trim()) return saveError('EMPTY');

  const source = await readMailSource(raw);
  const parsed = parseCollectEnGoMail({ text: source.text, html: source.html });
  if (!parsed.ok) return saveError('PARSE_FAILED', parsed.error);

  const stored = await storeParsedOrder(parsed.order, {
    source: 'PASTE',
    messageId: source.messageId,
    receivedAt: source.receivedAt ?? undefined,
  });
  revalidateCollectEnGo(stored.order.id);

  // Buiten elke try/catch: `redirect` werkt via een throw. De navigatie naar het
  // importscherm is hier de bevestiging.
  redirect(`/beheer/collectengo/${stored.order.id}`);
}

type LineChoice = {
  lineId: string;
  mode: 'existing' | 'new' | 'skip';
  itemId: string;
  name: string;
  brand: string;
  contentAmount: string;
  contentUnit: string;
  categoryId: string;
  quantity: number;
  expiry: string;
};

function readChoice(formData: FormData, lineId: string): LineChoice {
  const value = (field: string) => String(formData.get(`${field}-${lineId}`) ?? '').trim();
  const mode = value('mode');
  return {
    lineId,
    mode: mode === 'existing' || mode === 'new' ? mode : 'skip',
    itemId: value('item'),
    name: value('name'),
    brand: value('brand'),
    contentAmount: value('contentAmount'),
    contentUnit: value('contentUnit'),
    categoryId: value('category'),
    quantity: Number.parseInt(value('quantity'), 10),
    expiry: value('expiry'),
  };
}

/**
 * De bestelling in de voorraad zetten: per meegenomen lijn een lading, en voor
 * een nieuw product ook het item zelf.
 *
 * Alles in één transactie: half geïmporteerd is erger dan niet geïmporteerd, want
 * dan weet niemand nog welke lijnen al een lading kregen.
 */
export async function importCollectEnGoOrderAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();
  const orderId = String(formData.get('orderId') ?? '').trim();
  if (!orderId) return saveError('NOT_FOUND');

  const order = await prisma.collectEnGoOrder.findUnique({
    where: { id: orderId },
    include: { lines: { orderBy: { sortIndex: 'asc' } } },
  });
  if (!order) return saveError('NOT_FOUND');
  if (order.status === 'IMPORTED') return saveError('ALREADY_IMPORTED');

  const choices = order.lines.map((line) => readChoice(formData, line.id));
  const selected = choices.filter((choice) => choice.mode !== 'skip');
  if (selected.length === 0) return saveError('NOTHING_SELECTED');

  for (const choice of selected) {
    if (!Number.isInteger(choice.quantity) || choice.quantity < 1) return saveError('QUANTITY_INVALID');
    if (choice.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(choice.expiry)) return saveError('DATE_INVALID');
    if (choice.mode === 'existing' && !choice.itemId) return saveError('ITEM_REQUIRED');
    if (choice.mode === 'new' && !choice.name) return saveError('NAME_REQUIRED');
  }

  const byId = new Map(order.lines.map((line) => [line.id, line]));

  await prisma.$transaction(async (tx) => {
    for (const choice of selected) {
      const line = byId.get(choice.lineId);
      if (!line) continue;

      let itemId = choice.itemId;
      if (choice.mode === 'new') {
        const created = await tx.uitleenFlesserkeItem.create({
          data: {
            name: choice.name,
            brand: choice.brand || null,
            contentAmount: choice.contentAmount || null,
            contentUnit: choice.contentUnit || null,
            categoryId: choice.categoryId || null,
            quantity: 0,
          },
        });
        itemId = created.id;
      }

      // De notitie zegt waar deze lading vandaan komt; de prijzen blijven bij de
      // bestelling staan (zie docs/design-decisions.md).
      const origin = `C&G ${order.reservationNumber}`;
      await tx.uitleenFlesserkeBatch.create({
        data: {
          itemId,
          quantity: choice.quantity,
          expiryDate: choice.expiry ? new Date(`${choice.expiry}T00:00:00.000Z`) : null,
          note: line.note ? `${origin} - ${line.note}` : origin,
        },
      });
      await syncFlesserkeItemTotals(tx, itemId);

      await tx.collectEnGoOrderLine.update({
        where: { id: line.id },
        data: { flesserkeItemId: itemId, importedQuantity: choice.quantity },
      });

      // Onthouden waar dit product naartoe ging, zodat de volgende bestelling
      // niet opnieuw lijn per lijn aangeduid moet worden.
      const productKey = normalizeProductKey(line.productName);
      await tx.collectEnGoProductMatch.upsert({
        where: { productKey },
        create: { productKey, productName: line.productName, flesserkeItemId: itemId },
        update: { productName: line.productName, flesserkeItemId: itemId },
      });
    }

    await tx.collectEnGoOrder.update({
      where: { id: order.id },
      data: { status: 'IMPORTED', importedAt: new Date(), importedById: session.user.id },
    });
  });

  revalidateCollectEnGo(order.id);
  const skipped = choices.length - selected.length;
  return saveOk(
    `${selected.length} lijn(en) toegevoegd aan de flesserke-voorraad${skipped > 0 ? `; ${skipped} overgeslagen` : ''}.`
  );
}

/** Terzijde schuiven: de bestelling blijft staan, maar wacht niet meer. */
export async function ignoreCollectEnGoOrderAction(orderId: string): Promise<ActionResult> {
  await requireManage();
  const order = await prisma.collectEnGoOrder.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) return { ok: false, error: 'Deze bestelling bestaat niet meer.' };
  if (order.status === 'IMPORTED') return { ok: false, error: 'Deze bestelling is al geïmporteerd.' };

  await prisma.collectEnGoOrder.update({ where: { id: orderId }, data: { status: 'IGNORED' } });
  revalidateCollectEnGo(orderId);
  return { ok: true, message: 'Bestelling terzijde geschoven.' };
}

/** Definitief weg. De ladingen van een geïmporteerde bestelling blijven staan. */
export async function deleteCollectEnGoOrderAction(orderId: string): Promise<ActionResult> {
  await requireManage();
  const order = await prisma.collectEnGoOrder.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) return { ok: false, error: 'Deze bestelling bestaat niet meer.' };

  await prisma.collectEnGoOrder.delete({ where: { id: orderId } });
  revalidateCollectEnGo();
  return { ok: true, message: 'Bestelling verwijderd.' };
}
