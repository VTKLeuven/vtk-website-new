'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import {
  PUBLIC_COPY_KEYS,
  PUBLIC_COPY_MAX_LENGTH,
  PUBLIC_COPY_SETTING_KEY,
  type PublicCopy,
  type PublicCopyByLocale,
} from '@/lib/public-copy';

function readLocale(formData: FormData, locale: 'nl' | 'en'): PublicCopy | null {
  const entries = PUBLIC_COPY_KEYS.map((key) => {
    const value = String(formData.get(`${locale}.${key}`) ?? '').trim();
    if (value.length > PUBLIC_COPY_MAX_LENGTH) return null;
    return [key, value] as const;
  });
  if (entries.some((entry) => entry === null)) return null;
  return Object.fromEntries(entries as Array<readonly [string, string]>) as PublicCopy;
}

export async function savePublicCopyAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  await requireManage();

  const nl = readLocale(formData, 'nl');
  const en = readLocale(formData, 'en');
  if (!nl || !en) return saveError('TEXT_TOO_LONG');

  const value: PublicCopyByLocale = { nl, en };
  await prisma.setting.upsert({
    where: { key: PUBLIC_COPY_SETTING_KEY },
    update: { value },
    create: { key: PUBLIC_COPY_SETTING_KEY, value },
  });

  revalidatePath('/', 'layout');
  revalidatePath('/beheer/teksten');
  return saveOk();
}
