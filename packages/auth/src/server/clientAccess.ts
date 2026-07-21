/**
 * Mag dit lid überhaupt inloggen bij deze applicatie?
 *
 * Dit is een andere vraag dan "wat mag het er doen". Een OPEN client (de
 * cudi-tool) laat elk actief lid binnen en gebruikt permissies enkel om te
 * bepalen wie er méér mag; een RESTRICTED client (de interne wiki) laat enkel
 * binnen wie de `<namespace>.access`-permissie houdt.
 *
 * De blokkade zit in de autorisatieflow zelf (zie de `signup`-hook in auth.ts)
 * en niet in de applicatie: een app die zelf moet controleren of je binnen mag,
 * vergeet dat ooit.
 */
import 'server-only';

import { prisma } from '@vtk/db';
import { accessCodeFor } from '../lib/clientPermissionCodes';
import { effectiveClientPermissions } from './clientPermissions';

export type ClientAccess = {
  allowed: boolean;
  /** Voor de blokpagina: de naam van de app, niet haar client_id. */
  clientName: string | null;
};

/**
 * Een onbekende client geeft `allowed: false`. Dat is geen toegangsbeslissing:
 * de plugin weigert die aanvraag zelf al met `invalid_client`, en wij mogen hier
 * niet bevestigen of een client_id bestaat.
 */
export async function checkClientAccess(userId: string, clientId: string): Promise<ClientAccess> {
  const client = await prisma.oauthClient.findUnique({
    where: { clientId },
    select: { name: true, accessMode: true, permissionNamespace: true },
  });
  if (!client) return { allowed: false, clientName: null };

  if (client.accessMode === 'OPEN') return { allowed: true, clientName: client.name };

  // Beperkt, maar zonder namespace bestaat er geen access-code en kan niemand
  // ze houden. Dichthouden is hier het juiste antwoord: een beperkte client
  // waarvan de configuratie half af is, hoort niet open te vallen.
  if (!client.permissionNamespace) return { allowed: false, clientName: client.name };

  const codes = await effectiveClientPermissions(userId, clientId);
  return { allowed: codes.includes(accessCodeFor(client.permissionNamespace)), clientName: client.name };
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
