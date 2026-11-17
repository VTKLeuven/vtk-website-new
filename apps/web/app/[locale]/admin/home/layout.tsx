import { notFound } from "next/navigation";
import { CalendarDays, Clock, ExternalLink, Film, LayoutGrid, PanelsTopLeft, Rows3 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De homepage (`home.edit`) in tabbladen zoals Tickets, in de volgorde van de
 * pagina zelf: de hero, de openingsuren, wat we doen, de banden die kunnen
 * wegvallen (POC's, shiften), Career en de aftermovies, en de standaardfoto
 * van een evenement. Dat waren elf kaarten onder elkaar.
 */
export default async function AdminHomeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("home.edit");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/home`;

  const tabs: ModuleTab[] = [
    { href: base, label: "Hero", icon: <PanelsTopLeft {...ICON} />, segments: [null] },
    { href: `${base}/openingsuren`, label: nl ? "Openingsuren" : "Opening hours", icon: <Clock {...ICON} />, segments: ["openingsuren"] },
    { href: `${base}/aanbod`, label: nl ? "Wat we doen" : "What we do", icon: <LayoutGrid {...ICON} />, segments: ["aanbod"] },
    { href: `${base}/banden`, label: nl ? "Banden" : "Bands", icon: <Rows3 {...ICON} />, segments: ["banden"] },
    { href: `${base}/career`, label: "Career & media", icon: <Film {...ICON} />, segments: ["career"] },
    { href: `${base}/evenementen`, label: nl ? "Evenementen" : "Events", icon: <CalendarDays {...ICON} />, segments: ["evenementen"] },
  ];

  const viewLabel = nl ? "De homepage openen" : "Open the homepage";
  return (
    <ModuleAdminShell
      title={nl ? "Homepagina" : "Homepage"}
      navLabel={nl ? "Homepagina" : "Homepage"}
      tabs={tabs}
      actions={
        <a className="ticket-admin-icon-button" href={`${nl ? "" : "/en"}/`} target="_blank" rel="noreferrer" aria-label={viewLabel} title={viewLabel}>
          <ExternalLink aria-hidden="true" size={17} />
        </a>
      }
    >
      {children}
    </ModuleAdminShell>
  );
}
