import "server-only";

import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";
import type { CashRegisterAccess } from "@/lib/kassas/server";

export type PostChoice = { id: string; name: string; own: boolean };

/**
 * De posten in de keuzelijst van een aanvraag: je eigen posten bovenaan, dan
 * de rest. Elke actieve post is kiesbaar, zoals bij een rekening: een kassa voor
 * een activiteit die je samen met een andere post doet, staat op hun naam.
 * `currentGroupId` houdt een gedeactiveerde post kiesbaar op de kassa waar ze
 * al op stond.
 */
export async function postChoices(
  access: CashRegisterAccess,
  locale: "nl" | "en",
  currentGroupId?: string | null,
): Promise<PostChoice[]> {
  const keep = [...access.postIds, ...(currentGroupId ? [currentGroupId] : [])];
  const groups = await prisma.group.findMany({
    where: { OR: [{ active: true }, { id: { in: keep } }] },
    orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
    select: { id: true, nameNl: true, nameEn: true },
  });
  const suffix = locale === "nl" ? " (jouw post)" : " (your post)";
  const choices = groups.map((group) => {
    const own = access.postIds.includes(group.id);
    return { id: group.id, name: `${pick(group.nameNl, group.nameEn, locale)}${own ? suffix : ""}`, own };
  });
  return [...choices.filter((choice) => choice.own), ...choices.filter((choice) => !choice.own)];
}
