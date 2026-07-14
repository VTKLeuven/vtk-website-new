import Link from "next/link";

export type TheokotCaps = { manage: boolean; pickup: boolean };

type Tab = { key: string; href: string; labelNl: string; labelEn: string; cap: keyof TheokotCaps };

const TABS: Tab[] = [
  { key: "sessies", href: "", labelNl: "Sessies", labelEn: "Sessions", cap: "manage" },
  { key: "afhalen", href: "/afhalen", labelNl: "Afhaalbalie", labelEn: "Pickup counter", cap: "pickup" },
  { key: "turflijst", href: "/turflijst", labelNl: "Lijst bestelde broodjes", labelEn: "Ordered sandwiches list", cap: "pickup" },
  { key: "bans", href: "/bans", labelNl: "Bans & no-shows", labelEn: "Bans & no-shows", cap: "manage" },
  { key: "openingsuren", href: "/openingsuren", labelNl: "Openingsuren", labelEn: "Opening hours", cap: "manage" },
  { key: "instellingen", href: "/instellingen", labelNl: "Instellingen", labelEn: "Settings", cap: "manage" },
];

/** Sub-navigatie binnen het Theokot-adminonderdeel. */
export function TheokotAdminNav({
  base,
  nl,
  active,
  caps,
}: {
  base: string;
  nl: boolean;
  active: string;
  caps: TheokotCaps;
}) {
  const visible = TABS.filter((t) => caps[t.cap]);
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {visible.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${base}/admin/theokot${t.href}`}
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
