/**
 * Verdeelt items over gekende secties zonder hun volgorde te wijzigen.
 * Een verweesde sectionId valt bewust terug naar bovenaan: inhoud onzichtbaar
 * maken is een slechtere foutmodus dan ze buiten een sectie tonen.
 */
export function groupBySections<T>(
  items: readonly { item: T; sectionId: string | null }[],
  sectionIds: readonly string[]
): { unsectioned: T[]; bySection: Map<string, T[]> } {
  const known = new Set(sectionIds);
  const unsectioned: T[] = [];
  const bySection = new Map(sectionIds.map((id) => [id, [] as T[]]));

  for (const entry of items) {
    if (!entry.sectionId || !known.has(entry.sectionId)) {
      unsectioned.push(entry.item);
      continue;
    }
    bySection.get(entry.sectionId)?.push(entry.item);
  }

  return { unsectioned, bySection };
}
