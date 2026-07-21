/**
 * Per-client permissies: het vocabulaire dat één applicatie zelf definieert, en
 * wie het houdt.
 *
 * Het onderscheid dat alles hier stuurt: **granting** gebeurt via VTK-rollen en
 * posten, want anders is het niet te onderhouden (ontwerp 9.4). Wat de client te
 * zien krijgt is enkel de resulterende lijst codes; onze rollen, posten en
 * interne permissies blijven binnen. Zie ook de opmerking bij `entitlements` in
 * lib/claims.ts.
 */
import 'server-only';

import { prisma } from '@vtk/db';
import { currentWorkingYear } from '../lib/workingYear';
import { deriveAuthz, userGrantsInclude } from './session';

/**
 * De rol- en post-context van één lid voor dit werkingsjaar.
 *
 * Hergebruikt de join én de interpretatie van de sessie. Fase 4 heeft
 * `userGrantsInclude` en `deriveAuthz` precies hiervoor als seam laten staan:
 * twee resolvers die het oneens kunnen zijn over wat een lid mag, is hier de
 * slechtst mogelijke afloop (ontwerp 10.5).
 */
async function loadGrantContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userGrantsInclude(currentWorkingYear()),
  });
  if (!user || !user.active) return null;

  const roleIds = new Set<string>();
  deriveAuthz(user, (role) => roleIds.add(role.id));

  const groupIds = user.memberships.map((membership) => membership.groupId);
  const leadGroupIds = new Set(
    user.memberships.filter((membership) => membership.role === 'LEAD').map((membership) => membership.groupId)
  );

  return { roleIds: [...roleIds], groupIds, leadGroupIds };
}

/**
 * Welke codes van deze client dit lid effectief houdt.
 *
 * Jaar-scoping (ontwerp 9.5), en dit is de regel die leden zullen voelen:
 * toekenningen via rol en post volgen het werkingsjaar en resetten dus op 15
 * juli, directe toekenningen niet. Een directe grant aan de persoon die een
 * integratie onderhoudt is geen werkingsjaar-begrip, en elke partnertoepassing
 * 's nachts leegmaken is een storing die niemand zag aankomen. Wat wél tijdelijk
 * is, krijgt een `expiresAt`.
 */
export async function effectiveClientPermissions(userId: string, clientId: string): Promise<string[]> {
  const context = await loadGrantContext(userId);
  if (!context) return [];

  const now = new Date();
  const [direct, viaRole, viaGroup] = await Promise.all([
    prisma.ssoUserClientPermission.findMany({
      where: {
        userId,
        clientId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { permission: true },
    }),
    context.roleIds.length
      ? prisma.ssoRoleClientPermission.findMany({
          where: { clientId, roleId: { in: context.roleIds } },
          include: { permission: true },
        })
      : [],
    context.groupIds.length
      ? prisma.ssoGroupClientPermission.findMany({
          where: { clientId, groupId: { in: context.groupIds } },
          include: { permission: true },
        })
      : [],
  ]);

  const codes = new Set<string>();
  const add = (permission: { code: string; deprecated: boolean }) => {
    // Een afgevoerde code blijft werken voor wie ze al had, maar we geven ze
    // niet langer uit: ze staat op weg naar buiten.
    if (permission.deprecated) return;
    codes.add(permission.code);
  };

  for (const grant of direct) add(grant.permission);
  for (const grant of viaRole) add(grant.permission);
  for (const grant of viaGroup) {
    // LEADER telt enkel voor de verantwoordelijke, exact zoals GroupRole dat
    // voor rollen doet.
    if (grant.kind === 'LEADER' && !context.leadGroupIds.has(grant.groupId)) continue;
    add(grant.permission);
  }

  return [...codes].sort();
}
