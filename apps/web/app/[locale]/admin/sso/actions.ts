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
import { prisma } from '@vtk/db';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { checkRedirectUris } from './redirectUris';
import { logAudit } from '@/lib/audit';

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
 * Naam van de client voor in het adminlogboek. De SSO-tab houdt zelf een log per
 * client bij (SsoAuditLog); dit is de regel die in het overzicht van álle
 * admin-acties belandt.
 */
async function ssoClientName(clientId: string): Promise<string> {
  const client = await prisma.oauthClient.findUnique({
    where: { clientId },
    select: { name: true },
  });
  return client?.name ?? clientId;
}

/** Code van een per-client permissie, voor in het adminlogboek. */
async function ssoPermissionCode(permissionId: string): Promise<string> {
  const permission = await prisma.ssoClientPermission.findUnique({
    where: { id: permissionId },
    select: { code: true },
  });
  return permission?.code ?? permissionId;
}

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

    await logAudit({
      action: 'create',
      entity: 'ssoClient',
      entityId: client.clientId,
      target: parsed.data.name,
      summary: `${parsed.data.type}-client met ${parsed.data.redirectUris.length} redirect-URI('s)`,
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

  await logAudit({
    action: 'update',
    entity: 'ssoClient',
    entityId: parsed.data.clientId,
    target: parsed.data.name,
    summary: `${parsed.data.redirectUris.length} redirect-URI('s), scopes: ${parsed.data.scopes.join(', ')}`,
  });

  revalidatePath('/admin/sso');
  revalidatePath(`/admin/sso/${parsed.data.clientId}`);
  return saveOk();
}

export async function toggleClientAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  const disabled = formData.get('disabled') === '1';
  if (!clientId) return;

  await setSsoClientDisabled(await headers(), clientId, disabled);
  await logAudit({
    action: 'update',
    entity: 'ssoClient',
    entityId: clientId,
    target: await ssoClientName(clientId),
    summary: disabled ? 'client uitgezet' : 'client aangezet',
  });
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
    await logAudit({
      action: 'update',
      entity: 'ssoClient',
      entityId: clientId,
      target: await ssoClientName(clientId),
      summary: 'client-secret geroteerd; de oude werkt niet meer',
    });
    revalidatePath(`/admin/sso/${clientId}`);
    return { status: 'success', nonce: Date.now(), clientSecret };
  } catch {
    return { status: 'error', code: 'ROTATE_FAILED', nonce: Date.now() };
  }
}

export async function revokeTokensAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  if (!clientId) return;
  const name = await ssoClientName(clientId);
  await revokeSsoClientTokens(await headers(), clientId);
  await logAudit({
    action: 'revoke',
    entity: 'ssoClient',
    entityId: clientId,
    target: name,
    summary: 'alle tokens ingetrokken; iedereen moet opnieuw inloggen',
  });
  revalidatePath(`/admin/sso/${clientId}`);
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  if (!clientId) return;
  const name = await ssoClientName(clientId);
  await deleteSsoClient(await headers(), clientId);
  await logAudit({
    action: 'delete',
    entity: 'ssoClient',
    entityId: clientId,
    target: name,
  });
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

  await logAudit({
    action: 'update',
    entity: 'ssoClient',
    entityId: parsed.data.clientId,
    target: await ssoClientName(parsed.data.clientId),
    summary:
      parsed.data.accessMode === 'OPEN'
        ? 'toegang opengezet voor elk lid'
        : `toegang beperkt tot houders van ${parsed.data.permissionNamespace ?? 'de access-permissie'}`,
  });

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

  await logAudit({
    action: 'create',
    entity: 'ssoPermission',
    entityId: clientId,
    target: `${await ssoClientName(clientId)}: ${input.code}`,
  });

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

  await logAudit({
    action: 'update',
    entity: 'ssoPermission',
    entityId: clientId,
    target: `${await ssoClientName(clientId)}: ${labelNl}`,
    summary: formData.get('deprecated') === '1' ? 'gemarkeerd als verouderd' : 'labels bewerkt',
  });

  revalidateClient(clientId);
  return saveOk();
}

export async function deletePermissionAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  const permissionId = String(formData.get('permissionId') || '');
  if (!clientId || !permissionId) return;
  const permission = await prisma.ssoClientPermission.findUnique({
    where: { id: permissionId },
    select: { code: true },
  });
  await deleteClientPermission(await headers(), permissionId);
  await logAudit({
    action: 'delete',
    entity: 'ssoPermission',
    entityId: clientId,
    target: `${await ssoClientName(clientId)}: ${permission?.code ?? permissionId}`,
  });
  revalidateClient(clientId);
}

/**
 * Toekennen kan enkel via een rol of een post; rechtstreeks aan één lid bestaat
 * bewust niet meer (zie GrantTarget in de auth-laag).
 *
 * Geeft `SaveState` terug zodat het scherm de uitkomst kan tonen: een
 * toekenning die stil mislukt, laat de beheerder denken dat iemand toegang
 * heeft terwijl dat niet zo is.
 */
export async function grantPermissionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const clientId = String(formData.get('clientId') || '');
  const permissionId = String(formData.get('permissionId') || '');
  const kind = String(formData.get('kind') || '');
  if (!clientId || !permissionId) return saveError('INVALID_INPUT');

  const requestHeaders = await headers();
  try {
    if (kind === 'role') {
      const roleId = String(formData.get('roleId') || '');
      if (!roleId) return saveError('INVALID_INPUT');
      await grantClientPermission(requestHeaders, permissionId, { kind: 'role', roleId });
    } else if (kind === 'group') {
      const groupId = String(formData.get('groupId') || '');
      if (!groupId) return saveError('INVALID_INPUT');
      await grantClientPermission(requestHeaders, permissionId, {
        kind: 'group',
        groupId,
        grantKind: formData.get('grantKind') === 'LEADER' ? 'LEADER' : 'DEFAULT',
      });
    } else {
      return saveError('INVALID_INPUT');
    }
  } catch (error) {
    console.error('[sso] permissie toekennen mislukt:', error);
    return saveError(permissionErrorCode(error));
  }

  await logAudit({
    action: 'grant',
    entity: 'ssoPermission',
    entityId: clientId,
    target: `${await ssoClientName(clientId)}: ${await ssoPermissionCode(permissionId)}`,
    summary: kind === 'role' ? 'toegekend aan een rol' : 'toegekend aan een post',
  });

  revalidateClient(clientId);
  return saveOk();
}

export async function revokePermissionAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('clientId') || '');
  const grantId = String(formData.get('grantId') || '');
  const kind = String(formData.get('kind') || '');
  if (!clientId || !grantId || (kind !== 'role' && kind !== 'group')) return;

  await revokeClientPermission(await headers(), grantId, kind);
  await logAudit({
    action: 'revoke',
    entity: 'ssoPermission',
    entityId: clientId,
    target: await ssoClientName(clientId),
    summary: kind === 'role' ? 'afgenomen van een rol' : 'afgenomen van een post',
  });
  revalidateClient(clientId);
}
