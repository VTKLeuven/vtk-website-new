import "server-only";

import { prisma } from "@vtk/db";

/**
 * Afgenomen shiften: een `ManualShiftGrant` met een negatief `count`, gezet op
 * /admin/shiften (tab Extra shiften), bv. omdat iemand niet kwam opdagen.
 *
 * Een toekenning maakt echte `Shift`-rijen aan en telt daardoor overal vanzelf
 * mee. Een afname kan dat niet: een negatieve shift zou in iemands lijst, zijn
 * agenda en zijn bonnetjes opduiken. Ze heeft dus geen shiften, en elke plek die
 * shiften *telt* trekt ze er zelf af: de ranglijst, de voorverkoop voor vaste
 * medewerkers, /shift, de historiek, de app en de MCP. Een lijst van shiften
 * (wat staat er op mijn agenda) raakt ze niet, en de bonnetjes ook niet.
 *
 * Zie "Shiften afnemen" in `docs/design-decisions.md`.
 */
export type ShiftDeduction = {
  userId: string;
  name: string;
  post: string | null;
  /** Negatief: -1 is één shift afgenomen. */
  count: number;
  academicYear: number;
};

export async function shiftDeductions(
  filter: { userIds?: readonly string[]; academicYear?: number } = {},
): Promise<ShiftDeduction[]> {
  if (filter.userIds && filter.userIds.length === 0) return [];
  const rows = await prisma.manualShiftGrant.findMany({
    where: {
      count: { lt: 0 },
      ...(filter.userIds ? { userId: { in: [...new Set(filter.userIds)] } } : {}),
      ...(filter.academicYear !== undefined ? { academicYear: filter.academicYear } : {}),
    },
    select: {
      userId: true,
      post: true,
      count: true,
      academicYear: true,
      user: { select: { name: true } },
    },
  });
  return rows.map(({ user, ...row }) => ({ ...row, name: user.name }));
}

/** Hoeveel shiften er samen afgenomen zijn, als positief getal. */
export function deductedShifts(deductions: readonly Pick<ShiftDeduction, "count">[]): number {
  return deductions.reduce((total, deduction) => total - deduction.count, 0);
}

/**
 * Het aantal shiften dat een lid te zien krijgt: wat hij deed min wat er
 * afgenomen werd, nooit onder nul. De afname blijft wel staan: wie op nul staat
 * met één shift afgenomen, staat na zijn volgende shift nog altijd op nul.
 */
export function netShiftCount(done: number, deducted: number): number {
  return Math.max(0, done - deducted);
}
