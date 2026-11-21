import Link from "@/components/ui/Link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { nextMemberSort, type MemberSort, type MemberSortKey } from "@/lib/membership/sort";

/**
 * Een sorteerbare kolomkop voor de leden- en ereledenlijst.
 *
 * Een link en geen knop zoals `SortHeader` in `admin-table.tsx`: hier sorteert
 * de server (een ledenlijst telt duizenden rijen, en de Excel-export moet
 * dezelfde volgorde volgen), dus de sortering staat in de URL. `href` bouwt de
 * pagina, zodat de zoekterm, de soort en het jaar meegaan.
 */
export function SortLinkHeader({
  label,
  sortKey,
  sort,
  href,
  nl,
}: {
  label: string;
  sortKey: MemberSortKey;
  sort: MemberSort;
  href: (sort: MemberSort) => string;
  nl: boolean;
}) {
  const active = sort.key === sortKey ? sort.dir : null;
  const next = nextMemberSort(sort, sortKey);
  const Icon = active === "asc" ? ChevronUp : active === "desc" ? ChevronDown : ChevronsUpDown;
  const hint = nl
    ? `Sorteer op ${label.toLowerCase()}, ${next.dir === "asc" ? "oplopend" : "aflopend"}`
    : `Sort by ${label.toLowerCase()}, ${next.dir === "asc" ? "ascending" : "descending"}`;

  return (
    <th
      className="px-4 py-3 font-medium"
      aria-sort={active ? (active === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={href(next)}
        scroll={false}
        title={hint}
        aria-label={hint}
        className={`inline-flex min-h-6 items-center gap-1 uppercase tracking-wide hover:text-vtk-ink ${
          active ? "text-vtk-ink" : ""
        }`}
      >
        <span>{label}</span>
        <Icon aria-hidden size={13} strokeWidth={2} className={active ? "" : "opacity-60"} />
      </Link>
    </th>
  );
}
