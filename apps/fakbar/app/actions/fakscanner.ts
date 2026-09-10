'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { FAKSCANNER_SETTING_KEY } from '@vtk/db/fakscanner';
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
