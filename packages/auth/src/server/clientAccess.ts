/**
 * Mag dit lid überhaupt inloggen bij deze applicatie?
 *
 * Dit is een andere vraag dan "wat mag het er doen". Een OPEN client (de
 * cudi-tool) laat elk actief lid binnen en gebruikt permissies enkel om te
 * bepalen wie er méér mag; een RESTRICTED client (de interne wiki) laat enkel
 * binnen wie de `<namespace>.access`-permissie houdt.
 *
 * Daarnaast kan een client een KU Leuven-login vragen (`kulRequirement`),
 * los van die modus: LINKED wil dat het VTK-account aan een KU Leuven-login
 * hangt, STUDENT dat die login een studentenaccount was (Burgieclan).
 *
 * De blokkade zit in de autorisatieflow zelf (zie de `signup`-hook in auth.ts)
 * en niet in de applicatie: een app die zelf moet controleren of je binnen mag,
 * vergeet dat ooit.
 */
import 'server-only';

import { prisma } from '@vtk/db';
import type { SsoKulRequirement } from '@prisma/client';
import { KUL_PROVIDER_ID } from '../logins/kul';
import { accessCodeFor } from '../lib/clientPermissionCodes';
import { getMcpResourceUrl } from '../lib/mcpResource';
import { isMcpScope } from '../lib/scopes';
import { effectiveClientPermissions } from './clientPermissions';
import { resolveMcpUserAuthz } from './session';

/**
 * Waarom een lid tegenhoudt, voor de blokpagina:
 * - `permission`: de client is beperkt en het lid houdt `<ns>.access` niet;
 * - `kul`: er is een KU Leuven-login nodig die er niet is, of die sinds de
 *   studentencontrole nog niet gebeurde. Eén keer via KU Leuven aanmelden lost
 *   het op;
 * - `student`: de KU Leuven-login is gecontroleerd en is geen studentenaccount.
 */
export type ClientAccessDenial = 'permission' | 'kul' | 'student';

export type ClientAccess = {
  allowed: boolean;
  /** Voor de blokpagina: de naam van de app, niet haar client_id. */
  clientName: string | null;
  /** Enkel bij `allowed: false` en een bestaande client. */
  reason?: ClientAccessDenial;
  /** Wat de client vraagt, zodat de blokpagina het juiste kan uitleggen. */
  kulRequirement?: SsoKulRequirement;
};

export type ClientAccessContext = {
  requestedScopes?: readonly string[];
  requestedResource?: string | null;
};

/**
 * Een onbekende client geeft `allowed: false`. Dat is geen toegangsbeslissing:
 * de plugin weigert die aanvraag zelf al met `invalid_client`, en wij mogen hier
 * niet bevestigen of een client_id bestaat.
 */
export async function checkClientAccess(
  userId: string,
  clientId: string,
  context?: ClientAccessContext,
): Promise<ClientAccess> {
  const client = await prisma.oauthClient.findUnique({
    where: { clientId },
    select: { name: true, accessMode: true, permissionNamespace: true, scopes: true, kulRequirement: true },
  });
  if (!client) return { allowed: false, clientName: null };

  const base = { clientName: client.name, kulRequirement: client.kulRequirement };

  const hasMcpScope = context?.requestedScopes?.some((scope) => isMcpScope(scope)) ?? false;
  const mcpResourceUrl = getMcpResourceUrl();
  const hasMcpResource = Boolean(mcpResourceUrl && context?.requestedResource === mcpResourceUrl);
  const isMcpClient = client.scopes.some((scope) => isMcpScope(scope));

  if (hasMcpScope || hasMcpResource || isMcpClient) {
    const authz = await resolveMcpUserAuthz(userId);
    if (!authz || !authz.hasMcpUse) {
      return { ...base, allowed: false, reason: 'permission' };
    }
  }

  // Eerst de permissie: wie ze mist, helpt een KU Leuven-login niet verder, en
  // de blokpagina mag dan niet suggereren dat het wel zo is.
  if (client.accessMode === 'RESTRICTED') {
    // Beperkt, maar zonder namespace bestaat er geen access-code en kan niemand
    // ze houden. Dichthouden is hier het juiste antwoord: een beperkte client
    // waarvan de configuratie half af is, hoort niet open te vallen.
    if (!client.permissionNamespace) return { ...base, allowed: false, reason: 'permission' };

    const codes = await effectiveClientPermissions(userId, clientId);
    if (!codes.includes(accessCodeFor(client.permissionNamespace))) {
      return { ...base, allowed: false, reason: 'permission' };
    }
  }

  const kul = await kulDenial(userId, client.kulRequirement);
  return kul ? { ...base, allowed: false, reason: kul } : { ...base, allowed: true };
}

/**
 * `null` wanneer het lid aan de KU Leuven-voorwaarde voldoet.
 *
 * Bij STUDENT moet de koppeling er nog zijn én de laatste KU Leuven-login een
 * studentenaccount geweest zijn. `kulStudentChangedAt` leeg betekent "nog niet
 * gecontroleerd" (een koppeling van vóór deze controle), niet "geen student":
 * die krijgt `kul`, zodat de blokpagina vraagt om opnieuw via KU Leuven aan te
 * melden in plaats van te zeggen dat het lid geen student is.
 */
export async function kulDenial(
  userId: string,
  requirement: SsoKulRequirement
): Promise<'kul' | 'student' | null> {
  if (requirement === 'NONE') return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      kulStudent: true,
      kulStudentChangedAt: true,
      accounts: { where: { providerId: KUL_PROVIDER_ID }, select: { id: true }, take: 1 },
    },
  });
  if (!user || user.accounts.length === 0) return 'kul';
  if (requirement === 'LINKED') return null;

  if (!user.kulStudentChangedAt) return 'kul';
  return user.kulStudent ? null : 'student';
}

/** Hoeveel leden er na een omschakeling naar RESTRICTED nog binnen zouden raken. */
export async function countMembersWithAccess(clientId: string): Promise<number> {
  const client = await prisma.oauthClient.findUnique({
    where: { clientId },
    select: { permissionNamespace: true },
  });
  if (!client?.permissionNamespace) return 0;

  const permission = await prisma.ssoClientPermission.findUnique({
    where: { clientId_code: { clientId, code: accessCodeFor(client.permissionNamespace) } },
    select: { id: true },
  });
  if (!permission) return 0;

  // Directe toekenningen zijn exact te tellen; rol- en post-toekenningen niet
  // zonder elk lid door de resolver te halen. Daarom tellen we hier de
  // toekenningspaden, niet de leden: het antwoord dat de GUI nodig heeft is
  // "is dit nul", en dat klopt in beide gevallen.
  const [users, roles, groups] = await Promise.all([
    prisma.ssoUserClientPermission.count({
      where: { permissionId: permission.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    }),
    prisma.ssoRoleClientPermission.count({ where: { permissionId: permission.id } }),
    prisma.ssoGroupClientPermission.count({ where: { permissionId: permission.id } }),
  ]);

  return users + roles + groups;
}
