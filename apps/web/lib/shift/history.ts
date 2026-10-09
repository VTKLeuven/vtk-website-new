import { workingYearOf } from "@vtk/auth";
import { deductedShifts, netShiftCount, type ShiftDeduction } from "@/lib/shift/deductions";
import { earnedShiftReward, type PraesidiumYears } from "@/lib/shift/rewards";
import { nextShiftTier, shiftTierFor, type ShiftTier } from "@/lib/shift/tiers";

/**
 * Wat /shift/history per werkingsjaar toont: de titelladder, de posten, de
 * jaartabel en de shiften zelf. Zie "Mijn shiftgeschiedenis" in
 * `docs/design-decisions.md`.
 *
 * Dezelfde telling als de rail op /shift en de ranglijst: een shift telt mee
 * zodra ze voorbij is, in het werkingsjaar waarin ze begon (15 juli). Afgenomen
 * shiften gaan van het aantal af en dus van je titel, niet van de bonnetjes. In
 * een praesidiumjaar tellen je shiften wel mee, maar leveren ze niets op.
 */

export type HistoryShift = {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
  post: string | null;
  reward: number;
};

export type HistoryYear = {
  year: number;
  /** Nieuwste eerst, met wat elke shift jou opleverde. */
  shifts: (HistoryShift & { earned: number })[];
  deducted: number;
  /** Wat telt voor je titel en de voorverkoop: gedaan min afgenomen. */
  count: number;
  vouchers: number;
  /** Dat jaar in een praesidiumpost: de shiften leveren geen bonnetjes op. */
  praesidium: boolean;
  /** Meeste shiften eerst; `post: null` is een shift zonder post. */
  perPost: { post: string | null; count: number }[];
  tier: ShiftTier | null;
  next: ShiftTier | null;
};

/**
 * Elk werkingsjaar met een shift of een afname, nieuwste eerst. Het huidige jaar
 * staat er altijd bij, ook leeg: daar sta je op de ladder, en daar komt je
 * volgende shift.
 */
export function buildShiftHistory(input: {
  userId: string;
  shifts: readonly HistoryShift[];
  deductions: readonly Pick<ShiftDeduction, "academicYear" | "count">[];
  praesidium: PraesidiumYears;
  currentYear: number;
}): HistoryYear[] {
  const years = new Set<number>([input.currentYear]);
  for (const shift of input.shifts) years.add(workingYearOf(shift.startTime));
  for (const deduction of input.deductions) years.add(deduction.academicYear);

  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const shifts = input.shifts
        .filter((shift) => workingYearOf(shift.startTime) === year)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .map((shift) => ({
          ...shift,
          earned: earnedShiftReward({ userId: input.userId, ...shift }, input.praesidium),
        }));
      const deducted = deductedShifts(input.deductions.filter((d) => d.academicYear === year));
      const count = netShiftCount(shifts.length, deducted);

      const perPost = new Map<string | null, number>();
      for (const shift of shifts) perPost.set(shift.post, (perPost.get(shift.post) ?? 0) + 1);

      return {
        year,
        shifts,
        deducted,
        count,
        vouchers: shifts.reduce((total, shift) => total + shift.earned, 0),
        praesidium: input.praesidium.get(input.userId)?.has(year) ?? false,
        perPost: [...perPost]
          .map(([post, n]) => ({ post, count: n }))
          .sort((a, b) => b.count - a.count || (a.post ?? "").localeCompare(b.post ?? "")),
        tier: shiftTierFor(count),
        next: nextShiftTier(count),
      };
    });
}
