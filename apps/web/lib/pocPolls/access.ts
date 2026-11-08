import "server-only";
import { hasPermission } from "@vtk/auth";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@/lib/workingYear";

type Session = Parameters<typeof hasPermission>[0];

/**
 * Wie peilingen beheert: de RiVers van een POC, enkel voor hun eigen POC en
 * zonder apart recht, en wie `pocs.manage` heeft voor alle POC's.
 */
export async function managedPocIds(session: Session & { user: { id: string } }): Promise<string[] | "all"> {
  if (hasPermission(session, "pocs.manage")) return "all";
  const rows = await prisma.pocRepresentative.findMany({
    where: { userId: session.user.id, year: currentWorkingYear() },
    select: { pocId: true },
  });
  return rows.map((row) => row.pocId);
}

export function managesPoc(scope: string[] | "all", pocId: string): boolean {
  return scope === "all" || scope.includes(pocId);
}
