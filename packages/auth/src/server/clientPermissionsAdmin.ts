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
import { currentWorkingYear } from '../lib/workingYear';
import { effectiveClientPermissions } from './clientPermissions';
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
  // Optellen en niet toewijzen: er hoort één systeempermissie per client te
  // zijn, maar niets in het schema dwingt dat af. Overschrijven zou bij een
  // tweede rij de telling van de eerste weggooien, en dan blijft de
  // lock-out-waarschuwing stil terwijl niemand nog binnen raakt.
  for (const row of rows) counts[row.clientId] = (counts[row.clientId] ?? 0) + row._count.roleGrants;
  return counts;
}

/** Zelfde telling voor één client; de detailpagina heeft de rest niet nodig. */
export async function accessRoleGrantCount(headers: Headers, clientId: string): Promise<number> {
  await requireSsoAdmin(headers);
  const rows = await prisma.ssoClientPermission.findMany({
    where: { clientId, system: true },
    select: { _count: { select: { roleGrants: true } } },
  });
  return rows.reduce((total, row) => total + row._count.roleGrants, 0);
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
    // Wie de rol draagt, bepalen vóór het verwijderen; daarna is de link weg.
    const candidates = await membersOfRole(roleId);
    await prisma.ssoRoleClientPermission.deleteMany({ where: { permissionId, roleId } });
    // Enkel wie de code hierdoor écht kwijtraakt, wordt uitgelogd. Wie ze ook
    // via een andere rol of post heeft, merkt niets.
    await revokeTokensForUsersLosing(permission.clientId, permission.code, candidates);
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

  const previous = client.permissionNamespace;
  const namespace = input.permissionNamespace?.trim() || previous;
  if (input.accessMode === 'RESTRICTED' && !namespace) fail('NAMESPACE_REQUIRED');
  if (namespace) {
    const problem = checkNamespace(namespace);
    if (problem) fail(problem);
  }

  const renamed = !!previous && !!namespace && previous !== namespace;

  await prisma.$transaction(async (tx) => {
    await tx.oauthClient.update({
      where: { clientId },
      data: { accessMode: input.accessMode, permissionNamespace: namespace ?? null },
    });

    // De namespace hernoemen betekent élke code van deze client hernoemen.
    //
    // De toekenningen wijzen naar `permissionId` en niet naar de code, dus ze
    // overleven dit ongeschonden: wie `wiki.read` had, houdt `kb.read`. Zonder
    // die hernoeming zouden de oude codes blijven staan terwijl de poort naar
    // `<nieuw>.access` zoekt, en verloor iedereen stilzwijgend zijn toegang.
    //
    // Wat hier wél breekt is de applicatie aan de andere kant: die leest nog de
    // oude codes uit de claim. Het scherm waarschuwt daarvoor.
    if (renamed) {
      const rows = await tx.ssoClientPermission.findMany({
        where: { clientId },
        select: { id: true, code: true },
      });
      for (const row of rows) {
        if (!row.code.startsWith(`${previous}.`)) continue;
        await tx.ssoClientPermission.update({
          where: { id: row.id },
          data: { code: `${namespace}.${row.code.slice(previous.length + 1)}` },
        });
      }
    }
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
  // lopend token binnen blijven. Enkel die leden, niet iedereen: wie de
  // toegangspermissie wél houdt, hoeft niet opnieuw aan te melden. Kandidaten
  // zijn de leden met een lopend token; wie er geen heeft, valt vanzelf om.
  if (input.accessMode === 'RESTRICTED' && client.accessMode === 'OPEN' && namespace) {
    const tokenHolders = await prisma.oauthAccessToken.findMany({
      where: { clientId, userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    });
    await revokeTokensForUsersLosing(
      clientId,
      accessCodeFor(namespace),
      tokenHolders.map((token) => token.userId).filter((id): id is string => id !== null)
    );
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

  // Wie de code had, verliest ze nu. Bepaal dat vóór het verwijderen: daarna is
  // er niets meer om uit af te leiden.
  const affected = await holdersOf(permissionId);
  await prisma.ssoClientPermission.delete({ where: { id: permissionId } });
  await revokeTokensForUsers(client.clientId, affected);

  await writeAudit(actor, client, 'permission-delete', permission.code);
}

// ── Toekennen en intrekken ───────────────────────────────────────────────────

/**
 * Toekennen kan enkel via een rol of een post, nooit rechtstreeks aan een lid.
 *
 * Een losse toekenning aan één persoon werkt vandaag en valt stil zodra die
 * persoon vertrekt, zonder dat iemand het merkt. Rollen en posten zijn
 * werkingsjaar-gebonden en worden op het rollenscherm beheerd; dat is waar
 * toegang thuishoort. De tabel `SsoUserClientPermission` blijft bestaan voor
 * bestaande rijen en voor de flow-tester, maar er is geen beheerpad meer dat
 * er nieuwe aanmaakt.
 */
export type GrantTarget =
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

  if (target.kind === 'role') {
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

  // Toekennen neemt niemand iets af, dus hier hoeft geen token weg.
  await writeAudit(actor, client, 'grant', `${permission.code} via ${target.kind}`);
}

export async function revokeClientPermission(headers: Headers, grantId: string, kind: GrantTarget['kind']) {
  const actor = await requireSsoAdmin(headers);

  const grant =
    kind === 'role'
      ? await prisma.ssoRoleClientPermission.findUnique({ where: { id: grantId }, include: { permission: true } })
      : await prisma.ssoGroupClientPermission.findUnique({ where: { id: grantId }, include: { permission: true } });
  if (!grant) fail('PERMISSION_NOT_FOUND');
  const client = await loadClient(grant.clientId);

  const candidates =
    kind === 'role'
      ? await membersOfRole((grant as { roleId: string }).roleId)
      : await membersOfGroup(
          (grant as { groupId: string }).groupId,
          (grant as { kind: RoleGrantKind }).kind
        );

  if (kind === 'role') await prisma.ssoRoleClientPermission.delete({ where: { id: grantId } });
  else await prisma.ssoGroupClientPermission.delete({ where: { id: grantId } });

  await revokeTokensForUsersLosing(grant.clientId, grant.permission.code, candidates);
  await writeAudit(actor, client, 'revoke', `${grant.permission.code} via ${kind}`);
}

// ── Wie raakt dit ────────────────────────────────────────────────────────────

/** Leden die deze rol dit werkingsjaar dragen, rechtstreeks of via een post. */
async function membersOfRole(roleId: string): Promise<string[]> {
  const year = currentWorkingYear();
  const [direct, viaGroup] = await Promise.all([
    prisma.userRole.findMany({ where: { roleId, year }, select: { userId: true } }),
    prisma.groupRole.findMany({
      where: { roleId },
      select: {
        kind: true,
        group: { select: { memberships: { where: { year }, select: { userId: true, role: true } } } },
      },
    }),
  ]);

  const ids = new Set(direct.map((row) => row.userId));
  for (const grant of viaGroup) {
    for (const membership of grant.group.memberships) {
      if (grant.kind === 'LEADER' && membership.role !== 'LEAD') continue;
      ids.add(membership.userId);
    }
  }
  return [...ids];
}

/** Leden van deze post dit werkingsjaar; `LEADER` enkel de verantwoordelijke. */
async function membersOfGroup(groupId: string, kind: RoleGrantKind): Promise<string[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, year: currentWorkingYear() },
    select: { userId: true, role: true },
  });
  return memberships
    .filter((membership) => kind !== 'LEADER' || membership.role === 'LEAD')
    .map((membership) => membership.userId);
}

/** Iedereen die een permissie op dit moment houdt, langs welk pad dan ook. */
async function holdersOf(permissionId: string): Promise<string[]> {
  const [users, roles, groups] = await Promise.all([
    prisma.ssoUserClientPermission.findMany({ where: { permissionId }, select: { userId: true } }),
    prisma.ssoRoleClientPermission.findMany({ where: { permissionId }, select: { roleId: true } }),
    prisma.ssoGroupClientPermission.findMany({ where: { permissionId }, select: { groupId: true, kind: true } }),
  ]);

  const ids = new Set(users.map((row) => row.userId));
  for (const role of roles) for (const id of await membersOfRole(role.roleId)) ids.add(id);
  for (const group of groups) for (const id of await membersOfGroup(group.groupId, group.kind)) ids.add(id);
  return [...ids];
}

// ── Tokens ───────────────────────────────────────────────────────────────────
//
// Let op: een al uitgedeeld JWT access token is niet in te trekken en blijft
// geldig tot het vervalt. Dankzij `scopeExpirations: { entitlements: 600 }` is
// dat hoogstens tien minuten. Wat hier weggaat zijn de refresh tokens, zodat er
// niets nieuws meer uit voortkomt.

async function revokeTokensForUsers(clientId: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  await prisma.$transaction([
    prisma.oauthAccessToken.deleteMany({ where: { clientId, userId: { in: userIds } } }),
    prisma.oauthRefreshToken.deleteMany({ where: { clientId, userId: { in: userIds } } }),
  ]);
}

/**
 * Trekt de tokens in van precies die leden die de code **niet meer** houden.
 *
 * Een rol- of postgrant intrekken raakt lang niet iedereen: wie de code ook via
 * een andere rol krijgt, verandert er niets aan. Iedereen uitloggen omdat één
 * toekenning wegviel, is een storing veroorzaken om een storing te vermijden.
 *
 * Roep dit aan **nadat** de toekenning weg is; de resolver moet de nieuwe
 * toestand zien. De lus is bewust serieel: dit is een beheeractie op een
 * handvol leden, geen heet pad.
 */
async function revokeTokensForUsersLosing(clientId: string, code: string, candidates: string[]): Promise<void> {
  const losing: string[] = [];
  for (const userId of candidates) {
    const codes = await effectiveClientPermissions(userId, clientId);
    if (!codes.includes(code)) losing.push(userId);
  }
  await revokeTokensForUsers(clientId, losing);
}
