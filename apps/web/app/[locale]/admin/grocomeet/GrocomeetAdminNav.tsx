"use client";

import Link from "@/components/ui/Link";
import { useSelectedLayoutSegment } from "next/navigation";

const TABS = [
  { segment: null, href: "", nl: "Vergaderingen", en: "Meetings" },
  { segment: "openstaand", href: "/openstaand", nl: "Openstaand", en: "Outstanding" },
  { segment: "overzicht", href: "/overzicht", nl: "Overzicht", en: "Overview" },
  { segment: "drankjes", href: "/drankjes", nl: "Drankjes", en: "Drinks" },
] as const;

/**
 * De tabbladen van /admin/grocomeet, onderlijnd zoals die van het bureau
 * (`BureauTabs`): de GM en het bureau draaien op dezelfde code en horen er
 * hetzelfde uit te zien. Geen pillen: daaronder staan de semesterknoppen al als
 * pillen, en twee rijen pillen boven elkaar lezen als één keuze. Echte links per
 * tabblad, actief volgens het segment onder de layout.
 */
export function GrocomeetAdminNav({ nl }: { nl: boolean }) {
  const segment = useSelectedLayoutSegment();
  const base = `${nl ? "" : "/en"}/admin/grocomeet`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-vtk-blue/10" aria-label="Grocomeet">
      {TABS.map((tab) => {
        const active = tab.segment === segment;
        return (
          <Link
            key={tab.href}
            href={`${base}${tab.href}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-vtk-ink text-vtk-ink"
                : "border-transparent text-[#5c667f] hover:text-vtk-ink"
            }`}
          >
            {nl ? tab.nl : tab.en}
          </Link>
        );
      })}
    </nav>
  );
}
