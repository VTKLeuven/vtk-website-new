import "server-only";

import { prisma } from "@vtk/db";
// Rechtstreeks uit @prisma/client, niet via @vtk/db: dat package exporteert
// bewust enkel `prisma` (zie AGENTS.md).
import type { FormGrantRole } from "@prisma/client";
import { currentWorkingYear, hasPermission, type SessionPayload } from "@vtk/auth";
import { getAuthorizationPreview, requireSession } from "@/lib/session";
import { hasLivePermission } from "@/lib/livePermissions";

/**
 * Wat je met een formulier mag doen. Bewust fijner dan de drie rollen zelf: de
 * schermen checken een capability, zodat de rolindeling kan wijzigen zonder dat
 * elke pagina mee moet.
 */
export const FORM_CAPABILITIES = [
  "VIEW_FORM",
  "MANAGE_FORM",
  "VIEW_ENTRIES",
  "EXPORT",
  "MANAGE_ENTRIES",
  "MAIL_PARTICIPANTS",
  "MANAGE_ACCESS",
  "VIEW_AUDIT",
] as const;

export type FormCapability = (typeof FORM_CAPABILITIES)[number];

/**
 * Viewer leest en exporteert, editor beheert de inzendingen, manager beheert
 * daarbovenop het formulier zelf (velden, instellingen, toegang, verwijderen).
 */
const ROLE_CAPABILITIES: Record<FormGrantRole, readonly FormCapability[]> = {
  VIEWER: ["VIEW_FORM", "VIEW_ENTRIES", "EXPORT"],
  EDITOR: [
    "VIEW_FORM",
    "VIEW_ENTRIES",
    "EXPORT",
    "MANAGE_ENTRIES",
    "MAIL_PARTICIPANTS",
    "VIEW_AUDIT",
  ],
  MANAGER: FORM_CAPABILITIES,
};

export function capabilitiesForFormRoles(roles: readonly FormGrantRole[]): FormCapability[] {
  const capabilities = new Set<FormCapability>();
  for (const role of roles) {
    ROLE_CAPABILITIES[role].forEach((capability) => capabilities.add(capability));
  }
  return [...capabilities];
}

export async function hasLiveFormManageAll(
  userId: string,
  isSuperAdmin = false
): Promise<boolean> {
  return isSuperAdmin || hasLivePermission(userId, "forms.manageAll");
}

/**
 * Wie `forms.create` heeft, mag formulieren aanmaken voor elke post waar die
 * persoon dit werkingsjaar lid van is. Live gecheckt, want dit staat een
 * mutatie toe.
 */
export async function canCreateFormForGroup(
  userId: string,
  groupId: string,
  isSuperAdmin = false
): Promise<boolean> {
  if (isSuperAdmin) return true;
  if (await hasLivePermission(userId, "forms.manageAll")) return true;
  if (!(await hasLivePermission(userId, "forms.create"))) return false;

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId_year: { userId, groupId, year: currentWorkingYear() } },
    select: { id: true },
  });
  return Boolean(membership);
}

/** Sessie-variant voor read-only rendering en previews (knoppen tonen of niet). */
export function canSessionCreateFormForGroup(
  session: SessionPayload,
  groupId: string
): boolean {
  if (hasPermission(session, "forms.manageAll")) return true;
  return (
    hasPermission(session, "forms.create") &&
    session.groups.some((group) => group.id === groupId)
  );
}

export type FormAccess = Awaited<ReturnType<typeof getFormAccess>>;

/**
 * De rechten van de huidige gebruiker op één formulier: `forms.manageAll` geeft
 * alles, `forms.create` geeft alles voor formulieren van de eigen posten, en
 * anders tellen de expliciete grants (persoonlijk en via een post) op.
 */
export async function getFormAccess(formId: string) {
  const session = await requireSession();
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { ownerGroup: true, calendarEvent: true },
  });
  if (!form) return null;

  const capabilities = new Set<FormCapability>();

  if (
    hasPermission(session, "forms.manageAll") ||
    canSessionCreateFormForGroup(session, form.ownerGroupId)
  ) {
    FORM_CAPABILITIES.forEach((capability) => capabilities.add(capability));
  } else {
    // In previewmodus doet de superadmin alsof hij iemand anders is; zijn eigen
    // persoonlijke grants mogen dan niet meetellen.
    const preview = await getAuthorizationPreview();
    const membershipByGroup = new Map(session.groups.map((group) => [group.id, group.role]));
    const [userGrant, groupGrants] = await Promise.all([
      preview
        ? Promise.resolve(null)
        : prisma.formUserGrant.findUnique({
            where: { formId_userId: { formId, userId: session.user.id } },
            select: { role: true },
          }),
      prisma.formGroupGrant.findMany({
        where: { formId, groupId: { in: [...membershipByGroup.keys()] } },
        select: { groupId: true, role: true, scope: true },
      }),
    ]);

    const roles: FormGrantRole[] = [];
    if (userGrant) roles.push(userGrant.role);
    for (const grant of groupGrants) {
      const membershipRole = membershipByGroup.get(grant.groupId);
      if (!membershipRole) continue;
      if (grant.scope === "LEADS_ONLY" && membershipRole !== "LEAD") continue;
      roles.push(grant.role);
    }
    capabilitiesForFormRoles(roles).forEach((capability) => capabilities.add(capability));
  }

  return { session, form, capabilities: [...capabilities] };
}

/**
 * Dezelfde rekensom als {@link getFormAccess}, maar voor een hele lijst in twee
 * queries in plaats van twee per rij. Het overzicht heeft dit nodig om te weten
 * bij welke forms het de status mag laten wisselen.
 */
export async function formCapabilitiesByForm(
  formIds: readonly string[]
): Promise<Map<string, FormCapability[]>> {
  const session = await requireSession();
  if (formIds.length === 0) return new Map();
  if (hasPermission(session, "forms.manageAll")) {
    return new Map(formIds.map((id) => [id, [...FORM_CAPABILITIES]]));
  }

  // In previewmodus doet de superadmin alsof hij iemand anders is; zijn eigen
  // persoonlijke grants mogen dan niet meetellen (zoals in getFormAccess).
  const preview = await getAuthorizationPreview();
  const membershipByGroup = new Map(session.groups.map((group) => [group.id, group.role]));
  const [ownForms, userGrants, groupGrants] = await Promise.all([
    hasPermission(session, "forms.create")
      ? prisma.form.findMany({
          where: {
            id: { in: [...formIds] },
            ownerGroupId: { in: [...membershipByGroup.keys()] },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    preview
      ? Promise.resolve([])
      : prisma.formUserGrant.findMany({
          where: { formId: { in: [...formIds] }, userId: session.user.id },
          select: { formId: true, role: true },
        }),
    prisma.formGroupGrant.findMany({
      where: { formId: { in: [...formIds] }, groupId: { in: [...membershipByGroup.keys()] } },
      select: { formId: true, groupId: true, role: true, scope: true },
    }),
  ]);

  const ownFormIds = new Set(ownForms.map((form) => form.id));
  const rolesByForm = new Map<string, FormGrantRole[]>();
  function addRole(formId: string, role: FormGrantRole) {
    const current = rolesByForm.get(formId);
    if (current) current.push(role);
    else rolesByForm.set(formId, [role]);
  }
  for (const grant of userGrants) addRole(grant.formId, grant.role);
  for (const grant of groupGrants) {
    const membershipRole = membershipByGroup.get(grant.groupId);
    if (!membershipRole) continue;
    if (grant.scope === "LEADS_ONLY" && membershipRole !== "LEAD") continue;
    addRole(grant.formId, grant.role);
  }

  return new Map(
    formIds.map((id) => [
      id,
      ownFormIds.has(id)
        ? [...FORM_CAPABILITIES]
        : capabilitiesForFormRoles(rolesByForm.get(id) ?? []),
    ])
  );
}

export async function requireFormCapability(formId: string, capability: FormCapability) {
  const access = await getFormAccess(formId);
  if (!access) throw new Error("FORM_NOT_FOUND");
  if (!access.capabilities.includes(capability)) throw new Error("FORBIDDEN");
  return access;
}

/**
 * Prisma-filter voor "de formulieren die deze gebruiker mag zien". Gedeeld door
 * de lijstpagina en de nav-check, zodat die twee nooit uiteenlopen.
 */
export async function visibleFormsFilter() {
  const session = await requireSession();
  if (hasPermission(session, "forms.manageAll")) return {};

  const preview = await getAuthorizationPreview();
  const allGroupIds = session.groups.map((group) => group.id);
  const leadGroupIds = session.groups
    .filter((group) => group.role === "LEAD")
    .map((group) => group.id);

  return {
    OR: [
      ...(hasPermission(session, "forms.create")
        ? [{ ownerGroupId: { in: allGroupIds } }]
        : []),
      ...(preview ? [] : [{ userGrants: { some: { userId: session.user.id } } }]),
      {
        groupGrants: {
          some: {
            OR: [
              { scope: "ALL_MEMBERS" as const, groupId: { in: allGroupIds } },
              { scope: "LEADS_ONLY" as const, groupId: { in: leadGroupIds } },
            ],
          },
        },
      },
    ],
  };
}

/** Toont de admin het formulierentabblad? */
export async function canAccessAnyForm(): Promise<boolean> {
  const session = await requireSession();
  if (hasPermission(session, "forms.manageAll") || hasPermission(session, "forms.create")) {
    return true;
  }
  const count = await prisma.form.count({ where: await visibleFormsFilter() });
  return count > 0;
}
