/**
 * Wat voor lijst een groepsadres is, voor de filters op /admin/groepsadressen.
 *
 * Afgeleid uit de bronnen en niet als kolom bewaard: een lijst die van bron
 * verandert, verandert vanzelf van soort, en er is geen tweede waarheid die
 * kan afwijken van wat de sync doet.
 *
 * Geen `server-only`: puur.
 */

export const MAIL_GROUP_KINDS = [
  "post",
  "jaargroep",
  "kiesploeg",
  "poc",
  "werkgroep",
  "overig",
] as const;
export type MailGroupKind = (typeof MAIL_GROUP_KINDS)[number];

export function isMailGroupKind(value: string | undefined): value is MailGroupKind {
  return (MAIL_GROUP_KINDS as readonly string[]).includes(value ?? "");
}

export function mailGroupKind(row: {
  year: number | null;
  yearlyTemplate: string | null;
  ownerGroupId: string | null;
  sources: {
    groupId: string | null;
    groupType: string | null;
    kiesploegId: string | null;
    kiesploegPostId: string | null;
    pocId: string | null;
    groupKind?: string | null;
  }[];
}): MailGroupKind {
  if (row.year !== null) return "jaargroep";
  if (row.sources.some((s) => s.pocId)) return "poc";
  if (row.sources.some((s) => s.kiesploegId || s.kiesploegPostId)) return "kiesploeg";
  if (
    row.ownerGroupId ||
    row.sources.some((s) => s.groupType === "WERKGROEP" || s.groupKind === "WERKGROEP")
  ) {
    return "werkgroep";
  }
  if (row.yearlyTemplate || row.sources.some((s) => s.groupId || s.groupType)) return "post";
  return "overig";
}

export function mailGroupKindLabel(kind: MailGroupKind, nl: boolean): string {
  const labels: Record<MailGroupKind, [string, string]> = {
    post: ["Posten", "Posts"],
    jaargroep: ["Jaargroepen", "Yearly groups"],
    kiesploeg: ["Kiesploeg", "Kiesploeg"],
    poc: ["POC's", "POCs"],
    werkgroep: ["Werkgroepen", "Work groups"],
    overig: ["Met de hand", "Manual"],
  };
  return labels[kind][nl ? 0 : 1];
}
