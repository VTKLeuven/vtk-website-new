import { notFound } from "next/navigation";
import { CalendarClock, CalendarX2, ExternalLink, Settings2 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De piano (`piano.manage`) in tabbladen zoals Tickets: eerst wie er de
 * komende tijd speelt, dan wanneer ze vrij is (vensters en sluitingen), en de
 * instellingen met de tekst op de pianopagina.
 */
export default async function AdminPianoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("piano.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/piano`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Reservaties" : "Reservations", icon: <CalendarClock {...ICON} />, segments: [null] },
    {
      href: `${base}/beschikbaarheid`,
      label: nl ? "Beschikbaarheid" : "Availability",
      icon: <CalendarX2 {...ICON} />,
      segments: ["beschikbaarheid"],
    },
    { href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] },
  ];

  const viewLabel = nl ? "De pianopagina openen" : "Open the piano page";
  return (
    <ModuleAdminShell
      title="Piano"
      navLabel="Piano"
      tabs={tabs}
      actions={
        <a className="ticket-admin-icon-button" href={`${nl ? "" : "/en"}/piano`} target="_blank" rel="noreferrer" aria-label={viewLabel} title={viewLabel}>
          <ExternalLink aria-hidden="true" size={17} />
        </a>
      }
    >
      {children}
    </ModuleAdminShell>
  );
}
