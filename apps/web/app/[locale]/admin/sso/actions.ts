'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createSsoClient,
  deleteSsoClient,
  revokeSsoClientTokens,
  rotateSsoClientSecret,
  setSsoClientDisabled,
  updateSsoClient,
} from '@vtk/auth/server';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { checkRedirectUris } from './redirectUris';

/**
 * Dunne schil rond de functies in @vtk/auth: hier staat alleen het uitpakken van
 * het formulier en het verversen van de pagina. Alle regels en rechten zitten in
 * packages/auth/src/server/sso.ts.
 */

/** Eén URI per regel in het tekstveld. */
function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Haalt de uitleg uit een fout van de OAuth-plugin. Die gooit een APIError met
 * `error_description` erin, en dat is precies wat de beheerder moet lezen
 * ("Redirect URI must use HTTPS"), niet een algemeen "er ging iets mis".
 */
function oauthErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const body = (error as { body?: { error_description?: string; error?: string } }).body;
  return body?.error_description ?? body?.error ?? (error as { message?: string }).message;
}

const createSchema = z.object({
  name: z.string().min(1),
  redirectUris: z.array(z.string().url()).min(1),
  type: z.enum(['web', 'native', 'user-agent-based']),
  skipConsent: z.boolean(),
  clientUri: z.string().optional(),
  contacts: z.array(z.string()).optional(),
  /** Moeten in de scope-registry zitten; de plugin weigert de rest. */
  scopes: z.array(z.string()).min(1),
});

/**
 * Het secret komt maar één keer terug. We zetten het in de SaveState zodat het
 * scherm het meteen kan tonen; het staat nergens anders meer.
 */
export type CreateClientState =
  | { status: 'idle' }
  | { status: 'success'; nonce: number; clientId: string; clientSecret?: string }
  | { status: 'error'; code: string; nonce: number; message?: string };

export async function createClientAction(_prev: CreateClientState, formData: FormData): Promise<CreateClientState> {
  const parsed = createSchema.safeParse({
    name: String(formData.get('name') || '').trim(),
    redirectUris: lines(formData.get('redirectUris')),
    type: String(formData.get('type') || 'web'),
    skipConsent: formData.get('skipConsent') === 'on',
    clientUri: String(formData.get('clientUri') || '').trim() || undefined,
    contacts: lines(formData.get('contacts')),
    scopes: formData.getAll('scopes').map(String),
  });
  if (!parsed.success) return { status: 'error', code: 'INVALID_INPUT', nonce: Date.now() };

  try {
    const { client, clientSecret } = await createSsoClient(await headers(), {
      name: parsed.data.name,
      redirectUris: parsed.data.redirectUris,
      type: parsed.data.type,
      skipConsent: parsed.data.skipConsent,
      clientUri: parsed.data.clientUri,
      contacts: parsed.data.contacts?.length ? parsed.data.contacts : undefined,
      scopes: parsed.data.scopes,
    });

    revalidatePath('/admin/sso');
    return { status: 'success', nonce: Date.now(), clientId: client.clientId, clientSecret };
  } catch (error) {
    // De plugin weigert bv. een scope buiten de registry of een redirect-URI die
    // ze onveilig vindt; dat is invoer, geen serverfout. Geef door wat ze zegt.
    const message = oauthErrorMessage(error);
    console.error('[sso] client aanmaken mislukt:', message ?? error);
    return { status: 'error', code: 'CREATE_FAILED', message, nonce: Date.now() };
  }
}

const updateSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  redirectUris: z.array(z.string().url()).min(1),
  skipConsent: z.boolean(),
  clientUri: z.string().optional(),
  contacts: z.array(z.string()).optional(),
  scopes: z.array(z.string()).min(1),
});

export async function updateClientAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = updateSchema.safeParse({
    clientId: String(formData.get('clientId') || ''),
    name: String(formData.get('name') || '').trim(),
    redirectUris: lines(formData.get('redirectUris')),
    skipConsent: formData.get('skipConsent') === 'on',
    clientUri: String(formData.get('clientUri') || '').trim() || undefined,
    contacts: lines(formData.get('contacts')),
    scopes: formData.getAll('scopes').map(String),
  });
  if (!parsed.success) return saveError('INVALID_INPUT');

  // Zelfde controle als in de wizard, hier nog eens server-side: een
  // afgekeurde redirect-URI is invoer en hoort een leesbare melding te geven,
  // geen generieke "opslaan mislukt".
  const problem = checkRedirectUris(parsed.data.redirectUris);
  if (problem) return saveError(`REDIRECT_${problem.code}`);

  try {
    await updateSsoClient(await headers(), parsed.data.clientId, {
      name: parsed.data.name,
      redirectUris: parsed.data.redirectUris,
      skipConsent: parsed.data.skipConsent,
      clientUri: parsed.data.clientUri,
      contacts: parsed.data.contacts?.length ? parsed.data.contacts : undefined,
      scopes: parsed.data.scopes,
    });
  } catch (error) {
    console.error('[sso] client bijwerken mislukt:', oauthErrorMessage(error) ?? error);
    return saveError('SAVE_FAILED');
  }

  revalidatePath('/admin/sso');
  revalidatePath(`/admin/sso/${parsed.data.clientId}`);
  return saveOk();
}

export async function toggleClientAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  const disabled = formData.get('disabled') === '1';
  if (!clientId) return;

  await setSsoClientDisabled(await headers(), clientId, disabled);
  revalidatePath('/admin/sso');
  revalidatePath(`/admin/sso/${clientId}`);
}

/** Zie createClientAction: ook dit secret is eenmalig zichtbaar. */
export type RotateState =
  | { status: 'idle' }
  | { status: 'success'; nonce: number; clientSecret: string }
  | { status: 'error'; code: string; nonce: number };

export async function rotateSecretAction(_prev: RotateState, formData: FormData): Promise<RotateState> {
  const clientId = String(formData.get('clientId') || '');
  if (!clientId) return { status: 'error', code: 'INVALID_INPUT', nonce: Date.now() };

  try {
    const { clientSecret } = await rotateSsoClientSecret(await headers(), clientId);
    revalidatePath(`/admin/sso/${clientId}`);
    return { status: 'success', nonce: Date.now(), clientSecret };
  } catch {
    return { status: 'error', code: 'ROTATE_FAILED', nonce: Date.now() };
  }
}

export async function revokeTokensAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  if (!clientId) return;
  await revokeSsoClientTokens(await headers(), clientId);
  revalidatePath(`/admin/sso/${clientId}`);
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  if (!clientId) return;
  await deleteSsoClient(await headers(), clientId);
  revalidatePath('/admin/sso');

  // Terug naar de lijst: de detailpagina waar deze knop staat, bestaat nu niet
  // meer. Die navigatie is meteen de bevestiging, dus de knop toont geen toast.
  // `redirect` werkt via een throw, dus houd ze buiten elke try/catch.
  const redirectTo = String(formData.get('redirectTo') || '/admin/sso');
  redirect(redirectTo);
}
