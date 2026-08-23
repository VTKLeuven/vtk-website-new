import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { type GoogleConfig } from "./config";
import { listUsers } from "./client";
import { type LinkSuggestions, type WebsiteUser, suggestLinks } from "./linking";

/**
 * Haalt op wat het koppelscherm nodig heeft: de leden zonder gekoppeld
 * `@vtk.be`-account en de Google-accounts die nog vrij zijn.
 *
 * Bewust gedeeld door het scherm en de knop "alle voorstellen koppelen": die
 * knop herberekent hiermee zelf, in plaats van te vertrouwen op de paren die de
 * browser terugstuurt. Anders volstaat één gewijzigd formulierveld om iemand aan
 * het account van een ander te hangen.
 */
export type LinkCandidates = LinkSuggestions & {
  /** Leden die in aanmerking komen, voor de handmatige keuzelijst. */
  users: WebsiteUser[];
};

export async function collectLinkCandidates(cfg: GoogleConfig): Promise<LinkCandidates> {
  const year = currentWorkingYear();

  const [users, linked, directory] = await Promise.all([
    // Enkel wie dit of volgend werkingsjaar een post of werkgroep heeft. De
    // volledige ledenlijst zou een keuzelijst van duizenden namen opleveren,
    // terwijl enkel deze mensen een @vtk.be-account horen te hebben. Volgend
    // jaar staat erbij omdat de postverdeling vooruit ingevoerd wordt.
    prisma.user.findMany({
      where: {
        active: true,
        deletedAt: null,
        googleUserId: null,
        memberships: { some: { year: { in: [year, year + 1] } } },
      },
      select: { id: true, name: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.user.findMany({
      where: { googleUserId: { not: null } },
      select: { googleUserId: true },
    }),
    listUsers(cfg),
  ]);

  const claimed = new Set(linked.map((u) => u.googleUserId));
  const free = directory
    .filter((account) => !claimed.has(account.id) && !account.suspended)
    .map((account) => ({
      id: account.id,
      primaryEmail: account.primaryEmail,
      givenName: account.name?.givenName,
      familyName: account.name?.familyName,
      fullName: account.name?.fullName,
    }));

  return { ...suggestLinks({ users, directory: free }), users };
}
