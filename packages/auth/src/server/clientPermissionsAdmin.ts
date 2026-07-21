/**
 * Beheer van het permissievocabulaire van een client en van de toekenningen.
 *
 * Staat los van `clientPermissions.ts` (de resolver) zodat `auth.ts` enkel die
 * resolver binnentrekt: de plugin-config hoort de admin-laag niet te kennen, en
 * `sso.ts` importeert `auth` op zijn beurt weer.
 *
 * Zelfde contract als sso.ts: elke functie begint met `requireSsoAdmin` en laat
 * een auditregel achter.
 */
import 'server-only';

import type { RoleGrantKind, SsoAccessMode, SsoClientPermission } from '@prisma/client';
import { prisma } from '@vtk/db';
import { AuthError, hasPermission as rootHasPermission } from '..';
import { getSessionCached } from './session';
import {
  MAX_PERMISSIONS_PER_CLIENT,
  accessCodeFor,
  checkCode,
  checkNamespace,
  type CodeProblem,
} from '../lib/clientPermissionCodes';
import { requireSsoAdmin, writeAudit } from './sso';

/** Fouten die de GUI als rode toast toont in plaats van als error boundary. */
export type ClientPermissionError =
  | CodeProblem
  | 'CLIENT_NOT_FOUND'
  | 'PERMISSION_NOT_FOUND'
  | 'CODE_TAKEN'
  | 'TOO_MANY_PERMISSIONS'
  | 'SYSTEM_PERMISSION'
  | 'NAMESPACE_REQUIRED';

class PermissionError extends AuthError {
  constructor(public readonly problem: ClientPermissionError) {
    super('FORBIDDEN');
    this.name = 'PermissionError';
  }
}

function fail(problem: ClientPermissionError): never {
  throw new PermissionError(problem);
}

async function loadClient(clientId: string) {
  const client = await prisma.oauthClient.findUnique({
    where: { clientId },
    select: { clientId: true, name: true, accessMode: true, permissionNamespace: true },
  });
  if (!client) fail('CLIENT_NOT_FOUND');
  return client;
}

// ── Lezen ────────────────────────────────────────────────────────────────────

export type ClientPermissionRow = SsoClientPermission & {
  userGrantCount: number;
  roleGrantCount: number;
  groupGrantCount: number;
};

export async function listClientPermissions(headers: Headers, clientId: string): Promise<ClientPermissionRow[]> {
  await requireSsoAdmin(headers);
  const rows = await prisma.ssoClientPermission.findMany({
    where: { clientId },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    include: { _count: { select: { userGrants: true, roleGrants: true, groupGrants: true } } },
  });
  return rows.map(({ _count, ...row }) => ({
    ...row,
    userGrantCount: _count.userGrants,
    roleGrantCount: _count.roleGrants,
    groupGrantCount: _count.groupGrants,
  }));
}

/**
 * Per client het aantal **rollen** dat zijn toegangspermissie toekent.
 *
 * Bewust enkel rollen, en niet ook rechtstreekse of post-toekenningen: een rol
 * is de manier waarop toegang hoort te lopen (het rollenscherm beheert ze, en ze
 * volgen het werkingsjaar). Een beperkte client die enkel op losse toekenningen
 * aan personen draait, is broos; dat is precies wat "Aandacht vereist" moet
 * opmerken in plaats van verzwijgen.
 */
export async function accessRoleGrantCountsByClient(headers: Headers): Promise<Record<string, number>> {
  await requireSsoAdmin(headers);
  const rows = await prisma.ssoClientPermission.findMany({
    where: { system: true },
    select: { clientId: true, _count: { select: { roleGrants: true } } },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.clientId] = row._count.roleGrants;
  return counts;
}

// ── Vanuit het rollenscherm ──────────────────────────────────────────────────

/**
 * Het rollenscherm mag externe app-permissies aan een rol hangen zonder dat
 * iemand OAuth-beheerder is.
 *
 * Dat is geen verruiming: wie `roles.manage` heeft, kan sowieso élke
 * VTK-permissie aan een rol hangen (inclusief `oauth.client.edit` zelf). Het
 * vocabulaire definiëren blijft wél bij de OAuth-beheerder; hier worden enkel
 * bestaande codes toegekend.
 */
async function requireRoleAdmin(headers: Headers) {
  const session = await getSessionCached(headers);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  if (!rootHasPermission(session, 'roles.manage')) throw new AuthError('FORBIDDEN');
  return session;
}

/** Alle per-client permissies, gegroepeerd voor het rollenscherm. */
export async function listAllClientPermissions(headers: Headers) {
  await requireRoleAdmin(headers);
  const rows = await prisma.ssoClientPermission.findMany({
    where: { deprecated: false },
    orderBy: [{ clientId: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      labelNl: true,
      labelEn: true,
      system: true,
      clientId: true,
      client: { select: { name: true, accessMode: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    labelNl: row.labelNl,
    labelEn: row.labelEn,
    /** De permissie die toegang verleent; verdient nadruk in de UI. */
    grantsAccess: row.system,
    clientId: row.clientId,
    clientName: row.client.name ?? row.clientId,
    clientRestricted: row.client.accessMode === 'RESTRICTED',
  }));
}

/** Welke client-permissies deze rol toekent. */
export async function listRoleClientPermissions(headers: Headers, roleId: string): Promise<string[]> {
  await requireRoleAdmin(headers);
  const rows = await prisma.ssoRoleClientPermission.findMany({ where: { roleId }, select: { permissionId: true } });
  return rows.map((row) => row.permissionId);
}

/**
 * Zet één client-permissie aan of uit voor een rol. Tegenhanger van
 * `setRolePermissionAction` voor gewone VTK-permissies.
 */
export async function setRoleClientPermission(
  headers: Headers,
  roleId: string,
  permissionId: string,
  enabled: boolean
): Promise<void> {
  const actor = await requireRoleAdmin(headers);
  const permission = await prisma.ssoClientPermission.findUnique({ where: { id: permissionId } });
  if (!permission) fail('PERMISSION_NOT_FOUND');
  const client = await loadClient(permission.clientId);

  if (enabled) {
    await prisma.ssoRoleClientPermission.upsert({
      where: { permissionId_roleId: { permissionId, roleId } },
      update: {},
      create: { permissionId, clientId: permission.clientId, roleId, grantedByUserId: actor.user.id },
    });
  } else {
    await prisma.ssoRoleClientPermission.deleteMany({ where: { permissionId, roleId } });
    // Wie de rol had, verliest het recht meteen; laat er geen token op doorleven.
    await revokeTokensForClient(permission.clientId);
  }

  await writeAudit(
    actor,
    client,
    enabled ? 'grant' : 'revoke',
    `${permission.code} via rol (rollenscherm)`
  );
}

export type ClientGrants = {
  users: { id: string; permissionId: string; userId: string; userName: string; expiresAt: Date | null }[];
  roles: { id: string; permissionId: string; roleId: string }[];
  groups: { id: string; permissionId: string; groupId: string; kind: RoleGrantKind }[];
};

export async function listClientGrants(headers: Headers, clientId: string): Promise<ClientGrants> {
  await requireSsoAdmin(headers);
  const [users, roles, groups] = await Promise.all([
    prisma.ssoUserClientPermission.findMany({
      where: { clientId },
      include: { user: { select: { name: true } } },
      orderBy: { grantedAt: 'desc' },
    }),
    prisma.ssoRoleClientPermission.findMany({ where: { clientId } }),
    prisma.ssoGroupClientPermission.findMany({ where: { clientId } }),
  ]);

  return {
    users: users.map((grant) => ({
      id: grant.id,
      permissionId: grant.permissionId,
      userId: grant.userId,
      userName: grant.user.name,
      expiresAt: grant.expiresAt,
    })),
    roles: roles.map((grant) => ({ id: grant.id, permissionId: grant.permissionId, roleId: grant.roleId })),
    groups: groups.map((grant) => ({
      id: grant.id,
      permissionId: grant.permissionId,
      groupId: grant.groupId,
      kind: grant.kind,
    })),
  };
}

// ── Toegangsmodus ────────────────────────────────────────────────────────────

/**
 * Zet de toegangsmodus, en maakt bij `RESTRICTED` de `<ns>.access`-permissie aan
 * wanneer die nog niet bestaat.
 *
 * Dat automatisme is er met opzet: de code vergeten aan te maken zou de client
 * dichtzetten voor iedereen, inclusief degene die de knop omzette. De GUI zegt
 * bovendien vooraf hoeveel toekenningen er zijn (`countMembersWithAccess`).
 */
export async function setClientAccessMode(
  headers: Headers,
  clientId: string,
  input: { accessMode: SsoAccessMode; permissionNamespace?: string | null }
): Promise<void> {
  const actor = await requireSsoAdmin(headers);
  const client = await loadClient(clientId);

  const namespace = input.permissionNamespace?.trim() || client.permissionNamespace;
  if (input.accessMode === 'RESTRICTED' && !namespace) fail('NAMESPACE_REQUIRED');
  if (namespace) {
    const problem = checkNamespace(namespace);
    if (problem) fail(problem);
  }

  await prisma.oauthClient.update({
    where: { clientId },
    data: { accessMode: input.accessMode, permissionNamespace: namespace ?? null },
  });

  if (input.accessMode === 'RESTRICTED' && namespace) {
    const code = accessCodeFor(namespace);
    await prisma.ssoClientPermission.upsert({
      where: { clientId_code: { clientId, code } },
      update: { system: true, deprecated: false },
      create: {
        clientId,
        code,
        labelNl: 'Toegang tot deze applicatie',
        labelEn: 'Access to this application',
        descriptionNl: 'Zonder deze permissie kan een lid niet inloggen bij deze applicatie.',
        descriptionEn: 'Without this permission a member cannot sign in to this application.',
        system: true,
        sortOrder: -1,
      },
    });
  }

  // Van open naar beperkt: wie nu geen toegang meer heeft, mag niet met een
  // lopend token binnen blijven. De GUI waarschuwt hiervoor.
  if (input.accessMode === 'RESTRICTED' && client.accessMode === 'OPEN') {
    await revokeTokensForClient(clientId);
  }

  await writeAudit(
    actor,
    client,
    'access-mode',
    input.accessMode === 'RESTRICTED' ? `beperkt tot ${namespace}.access` : 'open voor elk lid'
  );
}

// ── Vocabulaire ──────────────────────────────────────────────────────────────

export type ClientPermissionInput = {
  code: string;
  labelNl: string;
  labelEn: string;
  descriptionNl?: string | null;
  descriptionEn?: string | null;
};

export async function createClientPermission(
  headers: Headers,
  clientId: string,
  input: ClientPermissionInput
): Promise<void> {
  const actor = await requireSsoAdmin(headers);
  const client = await loadClient(clientId);
  if (!client.permissionNamespace) fail('NAMESPACE_REQUIRED');

  const code = input.code.trim().toLowerCase();
  const problem = checkCode(code, client.permissionNamespace);
  if (problem) fail(problem);

  const count = await prisma.ssoClientPermission.count({ where: { clientId } });
  if (count >= MAX_PERMISSIONS_PER_CLIENT) fail('TOO_MANY_PERMISSIONS');

  const existing = await prisma.ssoClientPermission.findUnique({ where: { clientId_code: { clientId, code } } });
  if (existing) fail('CODE_TAKEN');

  await prisma.ssoClientPermission.create({
    data: {
      clientId,
      code,
      labelNl: input.labelNl.trim(),
      labelEn: input.labelEn.trim(),
      descriptionNl: input.descriptionNl?.trim() || null,
      descriptionEn: input.descriptionEn?.trim() || null,
      sortOrder: count,
    },
  });

  await writeAudit(actor, client, 'permission-create', code);
}

export async function updateClientPermission(
  headers: Headers,
  permissionId: string,
  input: Omit<ClientPermissionInput, 'code'> & { deprecated?: boolean }
): Promise<void> {
  const actor = await requireSsoAdmin(headers);
  const permission = await prisma.ssoClientPermission.findUnique({ where: { id: permissionId } });
  if (!permission) fail('PERMISSION_NOT_FOUND');
  const client = await loadClient(permission.clientId);

  await prisma.ssoClientPermission.update({
    where: { id: permissionId },
    data: {
      labelNl: input.labelNl.trim(),
      labelEn: input.labelEn.trim(),
      descriptionNl: input.descriptionNl?.trim() || null,
      descriptionEn: input.descriptionEn?.trim() || null,
      // De access-permissie mag nooit afgevoerd worden: dan kan niemand nog
      // binnen zonder dat er iets zichtbaar veranderde.
      ...(permission.system ? {} : { deprecated: input.deprecated ?? permission.deprecated }),
    },
  });

  await writeAudit(actor, client, 'permission-update', permission.code);
}

export async function deleteClientPermission(headers: Headers, permissionId: string): Promise<void> {
  const actor = await requireSsoAdmin(headers);
  const permission = await prisma.ssoClientPermission.findUnique({ where: { id: permissionId } });
  if (!permission) fail('PERMISSION_NOT_FOUND');
  const client = await loadClient(permission.clientId);

  // De access-permissie van een beperkte client weghalen sluit iedereen buiten.
  if (permission.system && client.accessMode === 'RESTRICTED') fail('SYSTEM_PERMISSION');

  // Toekenningen verdwijnen mee via cascade, dus de tokens van wie ze had
  // moeten weg: anders werkt een net ingetrokken recht nog tien minuten door.
  await prisma.ssoClientPermission.delete({ where: { id: permissionId } });
  await revokeTokensForClient(client.clientId);

  await writeAudit(actor, client, 'permission-delete', permission.code);
}

// ── Toekennen en intrekken ───────────────────────────────────────────────────

export type GrantTarget =
  | { kind: 'user'; userId: string; expiresAt?: Date | null }
  | { kind: 'role'; roleId: string }
  | { kind: 'group'; groupId: string; grantKind: RoleGrantKind };

export async function grantClientPermission(
  headers: Headers,
  permissionId: string,
  target: GrantTarget
): Promise<void> {
  const actor = await requireSsoAdmin(headers);
  const permission = await prisma.ssoClientPermission.findUnique({ where: { id: permissionId } });
  if (!permission) fail('PERMISSION_NOT_FOUND');
  const client = await loadClient(permission.clientId);
  const common = { permissionId, clientId: permission.clientId, grantedByUserId: actor.user.id };

  if (target.kind === 'user') {
    await prisma.ssoUserClientPermission.upsert({
      where: { permissionId_userId: { permissionId, userId: target.userId } },
      update: { expiresAt: target.expiresAt ?? null },
      create: { ...common, userId: target.userId, expiresAt: target.expiresAt ?? null },
    });
  } else if (target.kind === 'role') {
    await prisma.ssoRoleClientPermission.upsert({
      where: { permissionId_roleId: { permissionId, roleId: target.roleId } },
      update: {},
      create: { ...common, roleId: target.roleId },
    });
  } else {
    await prisma.ssoGroupClientPermission.upsert({
      where: {
        permissionId_groupId_kind: { permissionId, groupId: target.groupId, kind: target.grantKind },
      },
      update: {},
      create: { ...common, groupId: target.groupId, kind: target.grantKind },
    });
  }

  await writeAudit(actor, client, 'grant', `${permission.code} via ${target.kind}`);
}

export async function revokeClientPermission(headers: Headers, grantId: string, kind: GrantTarget['kind']) {
  const actor = await requireSsoAdmin(headers);

  if (kind === 'user') {
    const grant = await prisma.ssoUserClientPermission.findUnique({
      where: { id: grantId },
      include: { permission: true },
    });
    if (!grant) fail('PERMISSION_NOT_FOUND');
    const client = await loadClient(grant.clientId);
    await prisma.ssoUserClientPermission.delete({ where: { id: grantId } });
    // Alleen dit lid raakt zijn recht kwijt, dus alleen zijn tokens weg.
    await revokeTokensForUser(grant.clientId, grant.userId);
    await writeAudit(actor, client, 'revoke', `${grant.permission.code} van één lid`);
    return;
  }

  const grant =
    kind === 'role'
      ? await prisma.ssoRoleClientPermission.findUnique({ where: { id: grantId }, include: { permission: true } })
      : await prisma.ssoGroupClientPermission.findUnique({ where: { id: grantId }, include: { permission: true } });
  if (!grant) fail('PERMISSION_NOT_FOUND');
  const client = await loadClient(grant.clientId);

  if (kind === 'role') await prisma.ssoRoleClientPermission.delete({ where: { id: grantId } });
  else await prisma.ssoGroupClientPermission.delete({ where: { id: grantId } });

  // Welke leden dit raakt, is niet zonder de resolver per lid te weten; de hele
  // client intrekken is grover maar wél volledig.
  await revokeTokensForClient(grant.clientId);
  await writeAudit(actor, client, 'revoke', `${grant.permission.code} via ${kind}`);
}

// ── Tokens ───────────────────────────────────────────────────────────────────
//
// Let op: een al uitgedeeld JWT access token is niet in te trekken en blijft
// geldig tot het vervalt. Dankzij `scopeExpirations: { entitlements: 600 }` is
// dat hoogstens tien minuten. Wat hier weggaat zijn de refresh tokens, zodat er
// niets nieuws meer uit voortkomt.

async function revokeTokensForClient(clientId: string): Promise<void> {
  await prisma.$transaction([
    prisma.oauthAccessToken.deleteMany({ where: { clientId } }),
    prisma.oauthRefreshToken.deleteMany({ where: { clientId } }),
  ]);
}

async function revokeTokensForUser(clientId: string, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.oauthAccessToken.deleteMany({ where: { clientId, userId } }),
    prisma.oauthRefreshToken.deleteMany({ where: { clientId, userId } }),
  ]);
}
