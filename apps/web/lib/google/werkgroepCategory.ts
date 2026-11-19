import "server-only";

import { prisma } from "@vtk/db";

/**
 * De categorie van een werkgroep in het overzicht van de groepsadressen
 * (Werkgroepen › Mechanix): die met de werkgroep als eigenaar
 * (`MailGroupCategory.ownerGroupId`). Een subcategorie wint van een
 * hoofdcategorie, en bij twee de oudste. Null wanneer de werkgroep er geen heeft.
 *
 * Een lijst die een werkgroep zelf aanmaakt (`mechanix.g4@vtk.be`) kwam eerst
 * zonder categorie in het overzicht, onderaan bij de losse adressen, en moest
 * er met de hand in. Zie `docs/google-workspace.md`.
 */
export async function werkgroepCategoryId(ownerGroupId: string | null): Promise<string | null> {
  if (!ownerGroupId) return null;
  const categories = await prisma.mailGroupCategory.findMany({
    where: { ownerGroupId },
    select: { id: true, parentId: true },
    orderBy: { createdAt: "asc" },
  });
  return (categories.find((c) => c.parentId !== null) ?? categories[0])?.id ?? null;
}
