import "server-only";

import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";
import type { CashRegisterAccess } from "@/lib/kassas/server";
import { YEARLY_EVENT_CHOICE } from "@/lib/kassas/kassa";

export type PostChoice = { id: string; name: string; own: boolean };

/**
 * De posten in de keuzelijst van een aanvraag: je eigen posten bovenaan, dan
 * "Jaarwerking", dan de rest. Elke actieve post is kiesbaar, zoals bij een
 * rekening: een kassa voor een activiteit die je samen met een andere post doet,
 * staat op hun naam. `currentGroupId` houdt een gedeactiveerde post kiesbaar op
 * de kassa waar ze al op stond.
 *
 * "Jaarwerking" staat op geen post (`YEARLY_EVENT_CHOICE`), en hoog in de lijst:
 * tussen een dertigtal posten en werkgroepen zoek je ze anders onderaan. De
 * jaarwerkingen als groep (Kanweek, Halftime, ...) staan er daarom niet nog
 * eens apart bij: dan waren er twee manieren om hetzelfde te kiezen.
 */
export async function postChoices(
  access: CashRegisterAccess,
  locale: "nl" | "en",
  currentGroupId?: string | null,
): Promise<PostChoice[]> {
  const groups = await prisma.group.findMany({
    where: {
      OR: [
        { active: true, type: { not: "JAARWERKING" } },
        { id: { in: access.postIds }, type: { not: "JAARWERKING" } },
        ...(currentGroupId ? [{ id: currentGroupId }] : []),
      ],
    },
    orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
    select: { id: true, nameNl: true, nameEn: true },
  });
  const suffix = locale === "nl" ? " (jouw post)" : " (your post)";
  const choices = groups.map((group) => {
    const own = access.postIds.includes(group.id);
    return { id: group.id, name: `${pick(group.nameNl, group.nameEn, locale)}${own ? suffix : ""}`, own };
  });
  const yearly: PostChoice = {
    id: YEARLY_EVENT_CHOICE,
    name: locale === "nl" ? "Jaarwerking" : "Yearly event (jaarwerking)",
    own: false,
  };
  return [...choices.filter((choice) => choice.own), yearly, ...choices.filter((choice) => !choice.own)];
}
