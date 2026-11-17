import "server-only";
import { hasPermission } from "@vtk/auth";
import { prisma } from "@vtk/db";
import { getAuthorizationPreview } from "@/lib/session";
import { currentWorkingYear } from "@/lib/workingYear";

type Session = Parameters<typeof hasPermission>[0];

/**
 * Wie peilingen beheert: de RiVers van een POC, enkel voor hun eigen POC en
 * zonder apart recht, en wie `pocs.manage` heeft (VTK Onderwijs) voor alle POC's
 * en voor de algemene peilingen.
 */
export async function managedPocIds(session: Session & { user: { id: string } }): Promise<string[] | "all"> {
  if (hasPermission(session, "pocs.manage")) return "all";
  return representedPocIds(session.user.id);
}

/**
 * De POC's waarvan deze gebruiker dit werkingsjaar RiVer is. In een
 * autorisatievoorbeeld zijn dat de POC's die daar aangevinkt staan, en niet die
 * van je echte account: een RiVer is geen rol of post, dus de gesimuleerde
 * sessie draagt het niet zelf. Vraag het dus altijd hier, en niet rechtstreeks
 * aan `PocRepresentative`.
 */
export async function representedPocIds(userId: string): Promise<string[]> {
  const preview = await getAuthorizationPreview();
  if (preview) return preview.pocs.map((poc) => poc.id);
  const rows = await prisma.pocRepresentative.findMany({
    where: { userId, year: currentWorkingYear() },
    select: { pocId: true },
  });
  return rows.map((row) => row.pocId);
}

/** Een algemene peiling (`pocId = null`) is enkel voor wie `pocs.manage` heeft. */
export function managesPoc(scope: string[] | "all", pocId: string | null): boolean {
  return scope === "all" || (pocId !== null && scope.includes(pocId));
}
