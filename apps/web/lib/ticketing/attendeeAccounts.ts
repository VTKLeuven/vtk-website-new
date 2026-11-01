import "server-only";

import { prisma } from "@vtk/db";
import { currentStudyYear, currentWorkingYear } from "@/lib/workingYear";
import { membershipIsActive } from "@/lib/membership";
import {
  attendeeAccount,
  attendeeGroup,
  indexAttendeeAccounts,
  isBuyersOwnTicket,
  type AttendeeAccount,
  type AttendeeGroup,
  type AttendeeGroupItem,
} from "./attendeeGroups";

/**
 * De groep van elke deelnemer (zie `attendeeGroups.ts`), in de volgorde van
 * `items`. Eén lezing van de accounts voor de hele lijst, met hun post van dit
 * werkingsjaar en hun lidmaatschap van dit academiejaar: dezelfde grenzen als
 * de rest van de site (15 juli voor de posten, `userIsMember` voor leden).
 */
export async function attendeeGroupsFor(items: AttendeeGroupItem[]): Promise<AttendeeGroup[]> {
  if (items.length === 0) return [];
  const emails = new Set<string>();
  const rNumbers = new Set<string>();
  const buyerIds = new Set<string>();
  for (const item of items) {
    if (item.attendeeEmail) emails.add(item.attendeeEmail.toLowerCase());
    if (item.rNumber) rNumbers.add(item.rNumber.toLowerCase());
    if (isBuyersOwnTicket(item)) buyerIds.add(item.order.buyerUserId!);
  }

  const workingYear = currentWorkingYear();
  const studyYear = currentStudyYear();
  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...(emails.size > 0 ? [{ email: { in: [...emails], mode: "insensitive" as const } }] : []),
        ...(rNumbers.size > 0 ? [{ rNumber: { in: [...rNumbers] } }] : []),
        ...(buyerIds.size > 0 ? [{ id: { in: [...buyerIds] } }] : []),
      ],
    },
    select: {
      id: true,
      email: true,
      rNumber: true,
      honoraryMember: true,
      firwStudent: true,
      vtkMemberships: { where: { year: studyYear }, select: { activatedAt: true }, take: 1 },
      memberships: {
        where: { year: workingYear, group: { type: "PRAESIDIUM" } },
        select: { id: true },
        take: 1,
      },
    },
  });

  const accounts: AttendeeAccount[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    rNumber: user.rNumber,
    praesidium: user.memberships.length > 0,
    honorary: user.honoraryMember,
    member: user.firwStudent || membershipIsActive(user.vtkMemberships[0] ?? null),
  }));
  const index = indexAttendeeAccounts(accounts);
  return items.map((item) => attendeeGroup(item, attendeeAccount(item, index)));
}
