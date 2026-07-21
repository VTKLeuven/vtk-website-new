'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createClientPermission,
  createSsoClient,
  deleteClientPermission,
  deleteSsoClient,
  grantClientPermission,
  revokeClientPermission,
  revokeSsoClientTokens,
  rotateSsoClientSecret,
  setClientAccessMode,
  setSsoClientDisabled,
  updateClientPermission,
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

// ── Toegang en per-client permissies ────────────────────────────────────────
//
// Ook hier blijft de schil dun: de regels (codevalidatie, het automatisch
// aanmaken van `<ns>.access`, het intrekken van tokens) staan in
// packages/auth/src/server/clientPermissionsAdmin.ts.

/**
 * Vertaalt een fout uit de auth-laag naar een foutcode voor de toast. De
 * problemen die hier voorbijkomen (een code die al bestaat, een gereserveerde
 * namespace) zijn verwachte invoerfouten en horen geen error boundary te geven.
 */
function permissionErrorCode(error: unknown): string {
  const problem = (error as { problem?: string } | null)?.problem;
  return typeof problem === 'string' ? problem : 'SAVE_FAILED';
}

function revalidateClient(clientId: string): void {
  revalidatePath('/admin/sso');
  revalidatePath(`/admin/sso/${clientId}`);
}

const accessModeSchema = z.object({
  clientId: z.string().min(1),
  accessMode: z.enum(['OPEN', 'RESTRICTED']),
  permissionNamespace: z.string().optional(),
});

export async function setAccessModeAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = accessModeSchema.safeParse({
    clientId: formData.get('clientId'),
    accessMode: formData.get('accessMode'),
    permissionNamespace: String(formData.get('permissionNamespace') || '').trim() || undefined,
  });
  if (!parsed.success) return saveError('INVALID_INPUT');

  try {
    await setClientAccessMode(await headers(), parsed.data.clientId, {
      accessMode: parsed.data.accessMode,
      permissionNamespace: parsed.data.permissionNamespace ?? null,
    });
  } catch (error) {
    console.error('[sso] toegangsmodus wijzigen mislukt:', error);
    return saveError(permissionErrorCode(error));
  }

  revalidateClient(parsed.data.clientId);
  return saveOk();
}

const permissionSchema = z.object({
  clientId: z.string().min(1),
  code: z.string().min(1),
  labelNl: z.string().min(1),
  labelEn: z.string().min(1),
  descriptionNl: z.string().optional(),
  descriptionEn: z.string().optional(),
});

export async function createPermissionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = permissionSchema.safeParse({
    clientId: formData.get('clientId'),
    code: formData.get('code'),
    labelNl: formData.get('labelNl'),
    labelEn: formData.get('labelEn'),
    descriptionNl: String(formData.get('descriptionNl') || '') || undefined,
    descriptionEn: String(formData.get('descriptionEn') || '') || undefined,
  });
  if (!parsed.success) return saveError('INVALID_INPUT');

  const { clientId, ...input } = parsed.data;
  try {
    await createClientPermission(await headers(), clientId, input);
  } catch (error) {
    console.error('[sso] permissie aanmaken mislukt:', error);
    return saveError(permissionErrorCode(error));
  }

  revalidateClient(clientId);
  return saveOk();
}

export async function updatePermissionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const clientId = String(formData.get('clientId') || '');
  const permissionId = String(formData.get('permissionId') || '');
  const labelNl = String(formData.get('labelNl') || '');
  const labelEn = String(formData.get('labelEn') || '');
  if (!clientId || !permissionId || !labelNl || !labelEn) return saveError('INVALID_INPUT');

  try {
    await updateClientPermission(await headers(), permissionId, {
      labelNl,
      labelEn,
      descriptionNl: String(formData.get('descriptionNl') || '') || null,
      descriptionEn: String(formData.get('descriptionEn') || '') || null,
      deprecated: formData.get('deprecated') === '1',
    });
  } catch (error) {
    console.error('[sso] permissie bijwerken mislukt:', error);
    return saveError(permissionErrorCode(error));
  }

  revalidateClient(clientId);
  return saveOk();
}

export async function deletePermissionAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  const permissionId = String(formData.get('permissionId') || '');
  if (!clientId || !permissionId) return;
  await deleteClientPermission(await headers(), permissionId);
  revalidateClient(clientId);
}

export async function grantPermissionAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  const permissionId = String(formData.get('permissionId') || '');
  const kind = String(formData.get('kind') || '');
  if (!clientId || !permissionId) return;

  const requestHeaders = await headers();
  if (kind === 'user') {
    const userId = String(formData.get('userId') || '');
    if (!userId) return;
    const raw = String(formData.get('expiresAt') || '');
    const expiresAt = raw ? new Date(raw) : null;
    await grantClientPermission(requestHeaders, permissionId, {
      kind: 'user',
      userId,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    });
  } else if (kind === 'role') {
    const roleId = String(formData.get('roleId') || '');
    if (!roleId) return;
    await grantClientPermission(requestHeaders, permissionId, { kind: 'role', roleId });
  } else if (kind === 'group') {
    const groupId = String(formData.get('groupId') || '');
    if (!groupId) return;
    await grantClientPermission(requestHeaders, permissionId, {
      kind: 'group',
      groupId,
      grantKind: formData.get('grantKind') === 'LEADER' ? 'LEADER' : 'DEFAULT',
    });
  }

  revalidateClient(clientId);
}

export async function revokePermissionAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  const grantId = String(formData.get('grantId') || '');
  const kind = String(formData.get('kind') || '');
  if (!clientId || !grantId || (kind !== 'user' && kind !== 'role' && kind !== 'group')) return;

  await revokeClientPermission(await headers(), grantId, kind);
  revalidateClient(clientId);
}
