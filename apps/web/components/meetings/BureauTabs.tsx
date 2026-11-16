import Link from "@/components/ui/Link";

/**
 * Beheer en Statistieken van het VTK Bureau: twee tabs onder hetzelfde recht
 * (`bureau.manage`), zonder een tweede item in de zijbalk.
 */
export function BureauTabs({ nl, current }: { nl: boolean; current: "beheer" | "statistieken" }) {
  const base = `${nl ? "" : "/en"}/admin/bureau`;
  const tabs = [
    { key: "beheer", href: base, label: nl ? "Beheer" : "Manage" },
    { key: "statistieken", href: `${base}/statistieken`, label: nl ? "Statistieken" : "Statistics" },
  ] as const;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-vtk-blue/10" aria-label="VTK Bureau">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab.key === current
              ? "border-vtk-ink text-vtk-ink"
              : "border-transparent text-[#5c667f] hover:text-vtk-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
