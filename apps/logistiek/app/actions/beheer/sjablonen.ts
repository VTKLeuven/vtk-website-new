'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import type { ActionResult } from '@/app/actions/uitleen';
import { revalidateBeheer } from './shared';

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
