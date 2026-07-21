'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { disconnectApp } from '@vtk/auth/server';

/** Zie disconnectApp in @vtk/auth: dit lid, deze app, meer niet. */
export async function disconnectAppAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  if (!clientId) return;

  await disconnectApp(await headers(), clientId);
  revalidatePath('/account/verbonden-apps');
}
