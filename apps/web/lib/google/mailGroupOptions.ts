import "server-only";

import { prisma } from "@vtk/db";
import { GROUP_KINDS, everyGroupOfKindLabel } from "./members";

/**
 * De keuzelijsten van een groepsadres: welke bronnen er zijn (posten,
 * werkgroepen, POC's, kiesploegen) en de categorieën. Gedeeld door de
 * detailpagina en "Nieuw groepsadres", zodat beide dezelfde keuzes tonen.
 */

export type SourceOptionGroup = {
  label: string;
  options: { value: string; label: string }[];
};

/** `ownerId`: de werkgroep van de categorie, die het formulier dan voorstelt. */
export type CategoryOption = { value: string; label: string; hint?: string; group: string; ownerId?: string | null };

export async function loadSourceOptions(nl: boolean): Promise<SourceOptionGroup[]> {
  const [groups, kiesploegen, pocs] = await Promise.all([
    prisma.group.findMany({
      where: { active: true },
      select: { id: true, nameNl: true, nameEn: true, type: true },
      orderBy: { nameNl: "asc" },
    }),
    prisma.kiesploeg.findMany({
      where: { active: true },
      select: {
        id: true,
        formalName: true,
        posts: { select: { id: true, name: true }, orderBy: { order: "asc" } },
      },
      orderBy: { workingYear: "desc" },
    }),
    prisma.poc.findMany({ select: { id: true, nameNl: true, nameEn: true }, orderBy: { order: "asc" } }),
  ]);

  const g = (x: { nameNl: string; nameEn: string }) => (nl ? x.nameNl : x.nameEn);
  return [
    {
      label: nl ? "Alles" : "Everything",
      options: GROUP_KINDS.map((kind) => ({ value: `type:${kind}`, label: everyGroupOfKindLabel(kind, nl) })),
    },
    {
      label: nl ? "Posten" : "Posts",
      options: groups.filter((x) => x.type === "PRAESIDIUM").map((x) => ({ value: `group:${x.id}`, label: g(x) })),
    },
    {
      label: nl ? "Werkgroepen" : "Work groups",
      options: groups.filter((x) => x.type === "WERKGROEP").map((x) => ({ value: `group:${x.id}`, label: g(x) })),
    },
    {
      label: nl ? "Jaarwerkingen" : "Yearly events",
      options: groups.filter((x) => x.type === "JAARWERKING").map((x) => ({ value: `group:${x.id}`, label: g(x) })),
    },
    {
      label: nl ? "POC's (verkozen vertegenwoordigers)" : "POCs (elected representatives)",
      options: pocs.map((p) => ({ value: `poc:${p.id}`, label: nl ? p.nameNl : (p.nameEn ?? p.nameNl) })),
    },
    ...kiesploegen.map((k) => ({
      label: k.formalName,
      options: [
        { value: `kiesploeg:${k.id}`, label: nl ? "Volledige kiesploeg" : "Whole kiesploeg" },
        ...k.posts.map((post) => ({ value: `kiesploegPost:${post.id}`, label: post.name })),
      ],
    })),
  ].filter((group) => group.options.length > 0);
}

/** Per hoofdcategorie één kop, met de hoofdcategorie zelf bovenaan. */
export async function loadCategoryOptions(nl: boolean): Promise<CategoryOption[]> {
  const categories = await prisma.mailGroupCategory.findMany({
    select: { id: true, name: true, parentId: true, ownerGroupId: true },
    orderBy: { name: "asc" },
  });
  return categories
    .filter((c) => !c.parentId)
    .flatMap((c) => [
      { value: c.id, label: c.name, hint: nl ? "hoofdcategorie" : "main category", group: c.name, ownerId: c.ownerGroupId },
      ...categories
        .filter((s) => s.parentId === c.id)
        .map((s) => ({ value: s.id, label: s.name, group: c.name, ownerId: s.ownerGroupId })),
    ]);
}
