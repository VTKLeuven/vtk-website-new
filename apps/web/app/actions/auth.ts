'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { sanitizeNextUrl } from '@vtk/auth';
import { prisma } from '@vtk/db';
import { checkLoginBlocked, resolveLoginEmail, signInEmail, signOut } from '@vtk/auth/server';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { authLimiters, clientIpFromHeaders } from '@/lib/authThrottle';
import { requireSession } from '@/lib/session';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
  hardRedirect: z.boolean(),
});

/**
 * `redirectTo` wordt gezet in plaats van te redirecten wanneer de bestemming
 * geen pagina is maar het OAuth-authorize-endpoint; de client navigeert er dan
 * zelf hard naartoe. Zie `hardRedirect` in PasswordSignIn.
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

  // Een afgestudeerde kent zijn KU Leuven-adres vaak niet meer en tikt het adres
  // in waar hij zijn mail leest; dat vertalen we naar het login-adres.
  const email = await resolveLoginEmail(parsed.data.email);

  // Enkel mislukte pogingen tellen, per account en per adres; zie
  // lib/authThrottle.ts. Dit staat vóór `checkLoginBlocked`, want ook die toetst
  // het wachtwoord (bij een onbevestigd account) en is dus een manier om te
  // raden. 'TOO_MANY' zegt niets over het bestaan van een account: een adres
  // zonder account loopt even snel vol.
  const requestHeaders = await headers();
  const limits = authLimiters();
  const ip = clientIpFromHeaders(requestHeaders);
  if (limits.loginPerAccount.isFull(email) || limits.loginPerIp.isFull(ip)) {
    return { error: 'TOO_MANY' };
  }
  const failed = (): LoginState => {
    limits.loginPerAccount.hit(email);
    limits.loginPerIp.hit(ip);
    return { error: 'INVALID' };
  };

  // Foute credentials en een gedeactiveerd account geven allebei 'INVALID'; het
  // formulier mag niet verklappen welke adressen een account hebben. De enige
  // uitzondering is een zelfgemaakt account dat zijn mailadres nog niet
  // bevestigde: dat krijgt 'UNVERIFIED', maar pas nadat het wachtwoord klopte.
  const blocked = await checkLoginBlocked(email, parsed.data.password);
  if (blocked === 'INVALID') return failed();
  if (blocked !== 'NONE') return { error: blocked };

  try {
    await signInEmail(requestHeaders, {
      email,
      password: parsed.data.password,
    });
  } catch {
    return failed();
  }
  limits.loginPerAccount.clear(email);

  const next = sanitizeNextUrl(parsed.data.next);

  // Het authorize-endpoint is een route handler, geen pagina: daar kan de App
  // Router niet client-side naartoe navigeren. Hetzelfde geldt voor externe
  // domeinen (zoals logistiek of fakbar). Geef de URL terug en laat de
  // browser hem echt volgen, zodat de navigatie intact blijft.
  const isExternal = next.startsWith('http://') || next.startsWith('https://');
  if (parsed.data.hardRedirect || isExternal) return { redirectTo: next };

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

export async function updateProfileAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();
  const parsed = updateProfileSchema.safeParse({
    locale: String(formData.get('locale') || 'NL'),
  });
  if (!parsed.success) return saveError('INVALID_LOCALE');
  await prisma.user.update({ where: { id: session.user.id }, data: parsed.data });
  // De taalkeuze stuurt de weergave van het ledenportaal aan.
  revalidatePath('/account');
  return saveOk();
}
