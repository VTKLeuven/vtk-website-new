import "server-only";

import { prisma } from "@vtk/db";
import type { SessionPayload } from "@vtk/auth";
import { requireSession } from "@/lib/session";
import { werkgroepenWithOwnMemberRights } from "@/lib/werkgroepMembers";

/**
 * Wie welke groepsadressen mag beheren.
 *
 * Twee soorten beheerders, om dezelfde reden als bij de leden van een
 * werkgroep (`lib/werkgroepMembers.ts`):
 *
 * - **`mailgroups.manage`** beheert alles: bronnen, jaargroepen, eigenaars,
 *   overnemen uit Google.
 * - **Een werkgroep** beheert de lijsten waarvan ze eigenaar is (statix.pr):
 *   leden erbij en eraf, een nieuwe lijst met haar eigen voorvoegsel, en
 *   accounts aanvragen. Wie dat mag binnen de werkgroep, is dezelfde vraag als
 *   wie haar leden mag beheren (`werkgroepen.manageOwnMembers`), en enkel voor
 *   een werkgroep waarvoor IT een voorvoegsel (`Group.mailPrefix`) invulde.
 *   Zonder voorvoegsel kan ze geen adres kiezen, en dan heeft ze hier niets te
 *   doen.
 *
 * Accounts goedkeuren (`googleAccounts.manage`) staat daar los van: dat is IT
 * of de vice, nooit de werkgroep zelf.
 */
export type MailGroupAccess = {
  session: SessionPayload;
  manageAll: boolean;
  approveAccounts: boolean;
  /** Werkgroepen waarvan deze sessie de eigen lijsten beheert. */
  werkgroepIds: Set<string>;
};

export async function mailGroupAccess(session?: SessionPayload): Promise<MailGroupAccess> {
  const s = session ?? (await requireSession());
  const has = (permission: string) =>
    s.user.isSuperAdmin || (s.permissions as readonly string[]).includes(permission);

  const own = await werkgroepenWithOwnMemberRights(s, "WERKGROEP");
  const withPrefix =
    own.size === 0
      ? []
      : await prisma.group.findMany({
          where: { id: { in: [...own] }, mailPrefix: { not: null } },
          select: { id: true },
        });

  return {
    session: s,
    manageAll: has("mailgroups.manage"),
    approveAccounts: has("googleAccounts.manage"),
    werkgroepIds: new Set(withPrefix.map((g) => g.id)),
  };
}

/** Mag deze sessie de groepsadressen zien (de tab, de pagina)? */
export function canSeeMailGroups(access: MailGroupAccess): boolean {
  return access.manageAll || access.approveAccounts || access.werkgroepIds.size > 0;
}

/** Mag deze sessie de leden van deze lijst aanpassen? */
export function canEditMembers(
  access: MailGroupAccess,
  mailGroup: { ownerGroupId: string | null },
): boolean {
  if (access.manageAll) return true;
  return mailGroup.ownerGroupId !== null && access.werkgroepIds.has(mailGroup.ownerGroupId);
}

/** Gooit wanneer de sessie de lijst niet mag aanpassen; voor de server actions. */
export async function requireMailGroupEditor(
  mailGroupId: string,
): Promise<{ access: MailGroupAccess; mailGroup: { id: string; email: string; ownerGroupId: string | null } }> {
  const access = await mailGroupAccess();
  const mailGroup = await prisma.mailGroup.findUnique({
    where: { id: mailGroupId },
    select: { id: true, email: true, ownerGroupId: true },
  });
  if (!mailGroup || !canEditMembers(access, mailGroup)) {
    throw new Error("FORBIDDEN");
  }
  return { access, mailGroup };
}
