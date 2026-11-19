import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { BadgeEuro, FolderOpen, LayoutList, Settings2, Wallet } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { countsForBo } from "@/lib/bo/own";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Bestuursorgaan in tabbladen zoals Tickets: het resultatenoverzicht, de
 * prijscontroles en de instellingen voor Groep 5 (`bestuursorgaan.manage`),
 * en voor elke post haar eigen budgetten (ook de budgetten op de site,
 * `mijn/nieuw` en `mijn/<id>`) en de BO-mappen. Een post ziet hier enkel de
 * tabbladen; wat erin staat, filtert elke pagina zelf op de server. Zie
 * docs/bestuursorgaan.md.
 */
export default async function AdminBestuursorgaanLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/bestuursorgaan`;
  const session = await getCurrentSession();
  const manage = Boolean(session && hasPermission(session, "bestuursorgaan.manage"));
  // Dezelfde regel als de zijbalk (`guard.post` in de admin-layout): een post,
  // of de G3/G4 van een werkgroep.
  const post = Boolean(session?.groups.some(countsForBo));

  const tabs: ModuleTab[] = [];
  if (manage) {
    tabs.push({ href: base, label: nl ? "Resultatenoverzicht" : "Results overview", icon: <LayoutList {...ICON} />, segments: [null] });
  }
  if (manage || post) {
    tabs.push(
      { href: `${base}/mijn`, label: nl ? "Mijn budgetten" : "My budgets", icon: <Wallet {...ICON} />, segments: ["mijn"] },
      { href: `${base}/mappen`, label: nl ? "Bestuursorgaan" : "Board meetings", icon: <FolderOpen {...ICON} />, segments: ["mappen"] },
    );
  }
  if (manage) {
    tabs.push(
      { href: `${base}/prijzen`, label: nl ? "Prijscontroles" : "Price checks", icon: <BadgeEuro {...ICON} />, segments: ["prijzen"] },
      { href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] },
    );
  }

  return (
    <ModuleAdminShell title={nl ? "Bestuursorgaan" : "Board meetings"} navLabel={nl ? "Bestuursorgaan" : "Board meetings"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
