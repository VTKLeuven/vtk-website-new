import Link from "next/link";

export type ExpenseCaps = {
  submit: boolean;
  overview: boolean;
  settings: boolean;
};

type Tab = { key: string; href: string; labelNl: string; labelEn: string; cap: keyof ExpenseCaps };

const TABS: Tab[] = [
  { key: "overzicht", href: "", labelNl: "Overzicht", labelEn: "Overview", cap: "overview" },
  { key: "mijn", href: "/mijn", labelNl: "Mijn rekeningen", labelEn: "My expenses", cap: "submit" },
  { key: "indienen", href: "/indienen", labelNl: "Indienen", labelEn: "Submit", cap: "submit" },
  { key: "instellingen", href: "/instellingen", labelNl: "Instellingen", labelEn: "Settings", cap: "settings" },
];

/** Sub-navigatie binnen Rekeningen, zelfde vorm als bij Theokot. */
export function RekeningenNav({
  base,
  nl,
  active,
  caps,
}: {
  base: string;
  nl: boolean;
  active: string;
  caps: ExpenseCaps;
}) {
  const visible = TABS.filter((tab) => caps[tab.cap]);
  if (visible.length < 2) return null;

  return (
    <nav className="flex flex-wrap gap-2">
      {visible.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`${base}/admin/rekeningen${tab.href}`}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              isActive
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {nl ? tab.labelNl : tab.labelEn}
          </Link>
        );
      })}
    </nav>
  );
}
