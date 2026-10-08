'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@vtk/db';
import { FAKSCANNER_SETTING_KEY, validateFakPeriod } from '@vtk/db/fakscanner';
import type { ActionResult } from '@/app/actions/fakbar';
import { parseBrusselsDateTime } from '@/lib/brussels-datetime';
import { canManageFakbar, getSession } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';

/**
 * Instellingen van de fakscanner opslaan: het dubbeltelvenster, het aantal
 * check-ins per gratis pint en het uur waarop een nieuwe bardag begint.
 *
 * De kaartlezer op vtk.be leest dezelfde `Setting`-rij bij elke scan
 * (`getFakscannerConfig` in apps/web/lib/fakscanner-server.ts), dus een
 * wijziging hier is meteen actief aan de toog.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

async function requireFakbar(): Promise<void> {
  const session = await getSession();
  if (!session || !canManageFakbar(session)) {
    throw new Error('FORBIDDEN');
  }
}

/**
 * Slaat de instellingen op. Verwachte invoerfouten komen als `saveError(code)`
 * terug (rode toast) en niet als throw: een leeg of scheef ingetikt uur is geen
 * serverfout.
 */
export async function saveFakscannerConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireFakbar();

  const doubleStart = String(formData.get('doubleStart') ?? '').trim();
  const doubleEnd = String(formData.get('doubleEnd') ?? '').trim();
  const doubleEnabled = formData.get('doubleEnabled') === 'on';
  const rewardEvery = Number(formData.get('rewardEvery'));
  const dayRolloverTime = String(formData.get('dayRolloverTime') ?? '').trim();

  if (!HHMM.test(doubleStart) || !HHMM.test(doubleEnd)) return saveError('bad_time');
  // Een venster van 22:00 tot 22:00 zou "de klok rond" kunnen betekenen of
  // "nooit"; die dubbelzinnigheid weigeren we liever dan haar stil te kiezen.
  if (doubleEnabled && doubleStart === doubleEnd) return saveError('empty_window');
  if (!Number.isInteger(rewardEvery) || rewardEvery < 1 || rewardEvery > 1000) {
    return saveError('bad_reward');
  }
  if (!HHMM.test(dayRolloverTime)) return saveError('bad_rollover');

  const value = {
    rewardEvery,
    doubleEnabled,
    doubleStart,
    doubleEnd,
    dayRolloverTime,
  };

  await prisma.setting.upsert({
    where: { key: FAKSCANNER_SETTING_KEY },
    update: { value },
    create: { key: FAKSCANNER_SETTING_KEY, value },
  });

  revalidatePath('/admin/fakscanner');
  return saveOk();
}

// ── Periodes ─────────────────────────────────────────────────────────────────

const periodDateFmt = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function revalidatePeriods(id?: string): void {
  revalidatePath('/admin/fakscanner');
  revalidatePath('/admin/fakscanner/periodes');
  if (id) revalidatePath(`/admin/fakscanner/periodes/${id}`);
}

/**
 * Maakt een periode aan of werkt er een bij (met een `id` in het formulier).
 *
 * Periodes mogen niet overlappen: de scanner kijkt op elk moment naar hoogstens
 * één periode, en twee tegelijk zou betekenen dat het van de volgorde in de
 * databank afhangt welke regels gelden. Een nieuwe periode gaat na het opslaan
 * naar haar eigen pagina; die navigatie is de bevestiging.
 */
export async function saveFakPeriodAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireFakbar();

  const text = (key: string) => String(formData.get(key) ?? '').trim();
  const id = text('id') || null;
  const startsAt = parseBrusselsDateTime(text('startsAt'));
  const endsAt = parseBrusselsDateTime(text('endsAt'));
  if (!startsAt || !endsAt) return saveError('bad_range');

  const windowEnabled = formData.get('windowEnabled') === 'on';
  const data = {
    name: text('name'),
    startsAt,
    endsAt,
    windowStart: windowEnabled ? text('windowStart') : null,
    windowEnd: windowEnabled ? text('windowEnd') : null,
    intervalMinutes: Number(formData.get('intervalMinutes')),
    rewardEnabled: formData.get('rewardEnabled') === 'on',
    rewardEvery: Number(formData.get('rewardEvery')),
  };

  const invalid = validateFakPeriod(data);
  if (invalid) return saveError(invalid);

  const clash = await prisma.fakPeriod.findFirst({
    where: {
      ...(id ? { id: { not: id } } : {}),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { name: true, startsAt: true, endsAt: true },
  });
  if (clash) {
    return saveError(
      'overlap',
      `Deze periode overlapt met "${clash.name}" (${periodDateFmt.format(clash.startsAt)} tot ` +
        `${periodDateFmt.format(clash.endsAt)}). Er kan maar één periode tegelijk lopen.`,
    );
  }

  if (id) {
    const updated = await prisma.fakPeriod.updateMany({ where: { id }, data });
    if (updated.count === 0) return saveError('not_found');
    revalidatePeriods(id);
    return saveOk();
  }

  const created = await prisma.fakPeriod.create({ data, select: { id: true } });
  revalidatePeriods(created.id);
  // Buiten elke try/catch: `redirect()` werkt via een throw.
  redirect(`/admin/fakscanner/periodes/${created.id}`);
}

/**
 * Verwijdert een periode en de stand van iedereen erin. De jaarstand blijft
 * staan; liep de periode nog, dan telt de scanner meteen weer zoals altijd.
 */
export async function deleteFakPeriodAction(id: string): Promise<ActionResult> {
  await requireFakbar();
  const deleted = await prisma.fakPeriod.deleteMany({ where: { id } });
  revalidatePeriods(id);
  return deleted.count === 1
    ? { ok: true }
    : { ok: false, error: 'Deze periode bestond al niet meer. Ververs de pagina.' };
}
