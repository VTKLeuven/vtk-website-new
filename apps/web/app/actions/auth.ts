'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@vtk/db';
import { signInEmail, signOut } from '@vtk/auth/server';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
  hardRedirect: z.boolean(),
});

/**
 * `redirectTo` wordt gezet in plaats van te redirecten wanneer de bestemming
 * geen pagina is maar het OAuth-authorize-endpoint; de client navigeert er dan
 * zelf hard naartoe. Zie `hardRedirect` in LoginForm.
 */
export type LoginState = { error?: string; redirectTo?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get('email') || '')
      .trim()
      .toLowerCase(),
    password: String(formData.get('password') || ''),
    next: (formData.get('next') as string | null) ?? undefined,
    hardRedirect: formData.get('hardRedirect') === '1',
  });
  if (!parsed.success) {
    return { error: 'Invalid input' };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { active: true },
  });
  if (!user?.active) {
    return { error: 'INVALID' };
  }

  try {
    await signInEmail(await headers(), {
      email: parsed.data.email,
      password: parsed.data.password,
    });
  } catch {
    return { error: 'INVALID' };
  }

  const next =
    parsed.data.next && parsed.data.next.startsWith('/') && !parsed.data.next.startsWith('//') ? parsed.data.next : '/';

  // Het authorize-endpoint is een route handler, geen pagina: daar kan de App
  // Router niet client-side naartoe navigeren. Geef de URL terug en laat de
  // browser hem echt volgen, zodat de OAuth-redirectketen intact blijft.
  if (parsed.data.hardRedirect) return { redirectTo: next };

  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await signOut(await headers());
  redirect('/');
}

// De naam zit niet in dit formulier: voor- en achternaam worden bewerkt in het
// gegevensformulier eronder (zie ProfileForm / saveProfileAction).
const updateProfileSchema = z.object({
  locale: z.enum(['NL', 'EN']),
});

export async function updateProfileAction(userId: string, formData: FormData): Promise<SaveState> {
  const parsed = updateProfileSchema.safeParse({
    locale: String(formData.get('locale') || 'NL'),
  });
  if (!parsed.success) return saveError('INVALID_LOCALE');
  await prisma.user.update({ where: { id: userId }, data: parsed.data });
  // De taalkeuze stuurt de weergave van het ledenportaal aan.
  revalidatePath('/account');
  return saveOk();
}
