import Link from "@/components/ui/Link";

/** `control`: de lijst met afwijkingen, voor Beheer met `income.manage`. */
export type KassaCaps = { request: boolean; manage: boolean; control: boolean };

type Tab = { key: string; href: string; labelNl: string; labelEn: string; cap: keyof KassaCaps | "permanent" };

const TABS: Tab[] = [
  { key: "overzicht", href: "", labelNl: "Overzicht", labelEn: "Overview", cap: "manage" },
  { key: "controle", href: "/controle", labelNl: "Controle", labelEn: "Check", cap: "control" },
  // Het label komt van `permanentTabLabel`: "Kassa Theokot" voor de post zelf.
  { key: "vast", href: "/vast", labelNl: "", labelEn: "", cap: "permanent" },
  { key: "mijn", href: "/mijn", labelNl: "Mijn aanvragen", labelEn: "My requests", cap: "request" },
  { key: "aanvragen", href: "/aanvragen", labelNl: "Kassa aanvragen", labelEn: "Request a register", cap: "request" },
  { key: "instellingen", href: "/instellingen", labelNl: "Instellingen", labelEn: "Settings", cap: "manage" },
];

/** Sub-navigatie binnen Kassa's, zelfde vorm als bij Rekeningen. */
export function KassaNav({
  base,
  nl,
  active,
  caps,
  permanentLabel,
}: {
  base: string;
  nl: boolean;
  active: string;
  caps: KassaCaps;
  /** Het tabblad naar de vaste kassa's; `null` voor wie er geen heeft. */
  permanentLabel: string | null;
}) {
  const visible = TABS.filter((tab) => (tab.cap === "permanent" ? permanentLabel !== null : caps[tab.cap]));
  if (visible.length < 2) return null;

  return (
    <nav className="flex flex-wrap gap-2">
      {visible.map((tab) => (
        <Link
          key={tab.key}
          href={`${base}/admin/kassas${tab.href}`}
          aria-current={tab.key === active ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            tab.key === active
              ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
              : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
          }`}
        >
          {tab.cap === "permanent" ? permanentLabel : nl ? tab.labelNl : tab.labelEn}
        </Link>
      ))}
    </nav>
  );
}
