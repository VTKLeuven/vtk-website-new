/**
 * Wie er erelid is. Twee wegen, en een plek om ze samen te lezen:
 *
 * - **gratis**: `User.honoraryMember`, door een beheerder gezet en blijvend tot
 *   iemand het intrekt;
 * - **betalend**: een geactiveerd `Membership` van soort `HONORARY` voor dit
 *   academiejaar, dat op 14 september vervalt zoals elk lidmaatschap.
 *
 * Elke plek die vroeger enkel naar de vlag keek (de ticketshop, de voorverkoop,
 * de deelnemerslijst, de mail bij een geopende inschrijving), leest de
 * betaalde rij mee via `honoraryMembershipSelect`. Zonder die tweede tak
 * betaalt iemand 75 euro en ziet hij daarna geen enkel erelidticket.
 *
 * Bewust zonder prisma: dit is een select-fragment en een pure functie, zodat
 * het zonder database te testen is.
 */

/** Het select-fragment op `User` dat de betaalde erelidrij van een jaar meeleest. */
export function honoraryMembershipSelect(year: number) {
  return {
    vtkMemberships: {
      where: { year, kind: "HONORARY" as const, activatedAt: { not: null } },
      select: { id: true },
      take: 1,
    },
  };
}

/** De vlag, of een geactiveerde erelidrij uit `honoraryMembershipSelect`. */
export function isHonoraryMember(user: {
  honoraryMember: boolean;
  vtkMemberships?: readonly unknown[];
}): boolean {
  return user.honoraryMember || (user.vtkMemberships?.length ?? 0) > 0;
}
