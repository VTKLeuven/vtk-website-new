import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear, studyConfirmationYear } from "@vtk/auth";
import {
  type ActivityPerson,
  type ActivityYears,
  type GroupActivity,
  type MemberStatus,
  classifyGroups,
} from "./activity";
import {
  type DesiredContext,
  MAIL_GROUP_SELECT,
  type MailGroupForSync,
  desiredFor,
  isArchivedYear,
  loadDesiredContext,
} from "./desired";
import { normaliseEmail } from "./members";

/**
 * De gegevens achter `lib/google/activity.ts`: wie er in elke lijst zit, en wie
 * die adressen op de site zijn.
 */

export function activityYears(): ActivityYears {
  return { workingYear: currentWorkingYear(), studyYear: studyConfirmationYear() };
}

/**
 * De adressen die nu in de groep staan. Een jaargroep van een voorbij jaar
 * raakt de sync niet meer aan; daar staat in Google wat er als los lid in de
 * site staat, niet wat de post van dat jaar zou opleveren.
 */
export function currentAddresses(row: MailGroupForSync, ctx: DesiredContext): string[] {
  if (!isArchivedYear(row, ctx.year)) return desiredFor(row, ctx).emails;
  const out = new Set<string>();
  for (const extra of row.extras) {
    if (extra.kind !== "INCLUDE") continue;
    const address = extra.email ?? extra.user?.googleEmail ?? extra.user?.email ?? null;
    if (address) out.add(normaliseEmail(address));
  }
  return [...out].sort();
}

/** Wie deze adressen op de site zijn: hun account, hun Google-account of een werkgroepaccount. */
export async function loadActivityPeople(emails: string[]): Promise<Map<string, ActivityPerson>> {
  const unique = [...new Set(emails.map(normaliseEmail))];
  const out = new Map<string, ActivityPerson>();
  if (unique.length === 0) return out;

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { email: { in: unique } },
        { googleEmail: { in: unique } },
        { personalEmail: { in: unique } },
        { werkgroepAccounts: { some: { email: { in: unique } } } },
      ],
    },
    select: {
      name: true,
      email: true,
      googleEmail: true,
      personalEmail: true,
      active: true,
      isStudent: true,
      studyConfirmedYear: true,
      werkgroepAccounts: { select: { email: true } },
      memberships: { orderBy: { year: "desc" }, take: 1, select: { year: true } },
      kiesploegMemberships: {
        where: { kiesploeg: { active: true } },
        take: 1,
        select: { id: true },
      },
    },
  });

  const wanted = new Set(unique);
  for (const user of users) {
    const person: ActivityPerson = {
      name: user.name,
      lastPostYear: user.memberships[0]?.year ?? null,
      inActiveKiesploeg: user.kiesploegMemberships.length > 0,
      isStudent: user.isStudent,
      studyConfirmedYear: user.studyConfirmedYear,
      active: user.active,
    };
    // Het @vtk.be-account eerst: dat is het adres dat de site zelf in lijsten zet.
    const addresses = [
      user.googleEmail,
      ...user.werkgroepAccounts.map((a) => a.email),
      user.email,
      user.personalEmail,
    ];
    for (const raw of addresses) {
      if (!raw) continue;
      const address = normaliseEmail(raw);
      if (wanted.has(address) && !out.has(address)) out.set(address, person);
    }
  }
  return out;
}

export type GroupActivityRow = {
  members: { email: string; status: MemberStatus }[];
  activity: GroupActivity;
};

/**
 * Per lijst wie erin zit en hoe actief, voor het overzicht en de detailpagina.
 *
 * Een lid dat zelf een groep van de site is maar niet in `rows` zit, wordt erbij
 * gehaald: anders telde een geneste groep op de detailpagina altijd als
 * onbekend adres.
 */
export async function loadMailGroupActivity(
  rows: MailGroupForSync[],
  ctx: DesiredContext,
): Promise<Map<string, GroupActivityRow>> {
  const own = rows.map((row) => ({
    id: row.id,
    email: row.email,
    emails: currentAddresses(row, ctx),
  }));
  const ownEmails = new Set(rows.map((r) => r.email));
  const others = [...new Set(own.flatMap((g) => g.emails))].filter((e) => !ownEmails.has(e));
  const nestedRows = others.length
    ? ((await prisma.mailGroup.findMany({
        where: { email: { in: others } },
        select: MAIL_GROUP_SELECT,
      })) as unknown as MailGroupForSync[])
    : [];
  const nestedCtx = nestedRows.length ? await loadDesiredContext(nestedRows, ctx.year) : ctx;
  const groups = [
    ...own,
    ...nestedRows.map((r) => ({ id: r.id, email: r.email, emails: currentAddresses(r, nestedCtx) })),
  ];

  const people = await loadActivityPeople(groups.flatMap((g) => g.emails));
  const classified = classifyGroups(groups, people, activityYears());

  const out = new Map<string, GroupActivityRow>();
  for (const group of own) {
    const result = classified.get(group.id);
    if (!result) continue;
    out.set(group.id, {
      members: group.emails.map((email, i) => ({ email, status: result.statuses[i] })),
      activity: result.activity,
    });
  }
  return out;
}
