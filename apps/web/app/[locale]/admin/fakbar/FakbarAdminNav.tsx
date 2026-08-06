import Link from "next/link";

type Tab = { key: string; href: string; labelNl: string; labelEn: string };

const TABS: Tab[] = [
  { key: "shift", href: "", labelNl: "Shift", labelEn: "Shift" },
  { key: "weekoverzichten", href: "/weekoverzichten", labelNl: "Weekoverzichten", labelEn: "Weekly overviews" },
  { key: "inventaris", href: "/inventaris", labelNl: "Inventaris", labelEn: "Inventory" },
  { key: "standaardaanbod", href: "/standaardaanbod", labelNl: "Standaardaanbod", labelEn: "Default offering" },
];

/** Sub-navigatie binnen het Fakbar-adminonderdeel. Alle tabs hangen aan
 *  `fakbar.manage`, dus ze staan er allemaal of geen enkele. */
export function FakbarAdminNav({
  base,
  nl,
  active,
}: {
  base: string;
  nl: boolean;
  active: string;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${base}/admin/fakbar${t.href}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              isActive
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {nl ? t.labelNl : t.labelEn}
          </Link>
        );
      })}
    </nav>
  );
}
