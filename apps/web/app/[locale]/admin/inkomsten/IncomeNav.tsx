import Link from "@/components/ui/Link";

const TABS = [
  { key: "overzicht", href: "", nl: "Overzicht", en: "Overview" },
  { key: "opladen", href: "/opladen", nl: "Opladen", en: "Upload" },
  { key: "na-te-kijken", href: "/na-te-kijken", nl: "Na te kijken", en: "To review" },
  { key: "transacties", href: "/transacties", nl: "Transacties", en: "Transactions" },
  { key: "instellingen", href: "/instellingen", nl: "Instellingen", en: "Settings" },
] as const;

export type IncomeTab = (typeof TABS)[number]["key"];

/** Sub-navigatie binnen Online inkomsten, zelfde vorm als bij Kassa's. */
export function IncomeNav({ base, nl, active, openCount }: { base: string; nl: boolean; active: IncomeTab; openCount: number }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`${base}/admin/inkomsten${tab.href}`}
          aria-current={tab.key === active ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            tab.key === active
              ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
              : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
          }`}
        >
          {nl ? tab.nl : tab.en}
          {tab.key === "na-te-kijken" && openCount > 0 ? (
            <span className="ml-1.5 tabular-nums opacity-80">{openCount}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
