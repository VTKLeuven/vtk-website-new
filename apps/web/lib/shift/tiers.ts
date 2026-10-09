/**
 * De titels die je verdient met het aantal voltooide shiften in een
 * academiejaar. De ranglijst in /admin/shiften zet een scheiding bij elke
 * drempel. Zie "Titels voor shiften" in `docs/design-decisions.md`.
 *
 * Van hoog naar laag, zodat de eerste drempel die je haalt je titel is.
 */
export const SHIFT_TIERS = [
  { min: 50, nl: "Platinum", en: "Platinum" },
  { min: 30, nl: "Gold", en: "Gold" },
  { min: 20, nl: "Silver", en: "Silver" },
  { min: 15, nl: "Vaste medewerker", en: "Regular volunteer" },
  { min: 10, nl: "Bronze", en: "Bronze" },
  { min: 3, nl: "Medewerker", en: "Volunteer" },
] as const;

export type ShiftTier = (typeof SHIFT_TIERS)[number];

/** De titel bij dit aantal shiften, of `null` onder de laagste drempel. */
export function shiftTierFor(count: number): ShiftTier | null {
  return SHIFT_TIERS.find((tier) => count >= tier.min) ?? null;
}

/** De eerstvolgende titel die je nog niet haalt, of `null` bij de hoogste. */
export function nextShiftTier(count: number): ShiftTier | null {
  return [...SHIFT_TIERS].reverse().find((tier) => tier.min > count) ?? null;
}

/**
 * Waar je op de titelladder van /shift/history staat, in procent van de breedte.
 *
 * De titels staan gelijk verdeeld en niet op schaal: op schaal zaten 3 en 10 op
 * een kluitje links en lag er een lege halve ladder tussen 30 en 50. Elke titel
 * staat in het midden van zijn kolom; tussen twee titels schuift de markering
 * evenredig op, en onder de laagste vertrekt ze van de linkerrand.
 */
export function shiftLadderPosition(count: number): number {
  const ascending = [...SHIFT_TIERS].reverse();
  const center = (index: number) => ((index + 0.5) / ascending.length) * 100;
  const next = ascending.findIndex((tier) => tier.min > count);
  if (next === -1) return center(ascending.length - 1);
  const fromMin = next === 0 ? 0 : ascending[next - 1].min;
  const fromPos = next === 0 ? 0 : center(next - 1);
  const share = (Math.max(0, count) - fromMin) / (ascending[next].min - fromMin);
  return fromPos + share * (center(next) - fromPos);
}

/**
 * "20 tot 29 shiften", "50 of meer shiften", "minder dan 3 shiften": het bereik
 * van een titel, of van de groep zonder titel wanneer `tier` null is.
 */
export function shiftTierRange(tier: ShiftTier | null, locale: "nl" | "en" = "nl"): string {
  const nl = locale === "nl";
  if (!tier) {
    const lowest = SHIFT_TIERS[SHIFT_TIERS.length - 1].min;
    return nl ? `minder dan ${lowest} shiften` : `fewer than ${lowest} shifts`;
  }
  const next = SHIFT_TIERS[SHIFT_TIERS.indexOf(tier) - 1];
  if (!next) return nl ? `${tier.min} of meer shiften` : `${tier.min} or more shifts`;
  return nl ? `${tier.min} tot ${next.min - 1} shiften` : `${tier.min} to ${next.min - 1} shifts`;
}
