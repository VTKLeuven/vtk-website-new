import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { FileText, PanelTop } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De header (categorieën en menu-items, `pages.manage`) en de pagina's eronder
 * (`pages.edit`/`pages.editAll`) in tabbladen zoals Tickets. Een route-groep:
 * de adressen blijven /admin/header en /admin/paginas.
 */
export default async function AdminNavigationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin`;
  const session = await getCurrentSession();
  const can = (perm: Parameters<typeof hasPermission>[1]) => Boolean(session && hasPermission(session, perm));

  const tabs: ModuleTab[] = [];
  if (can("pages.manage")) {
    tabs.push({ href: `${base}/header`, label: "Header", icon: <PanelTop {...ICON} />, segments: ["header"] });
  }
  if (can("pages.edit") || can("pages.editAll")) {
    tabs.push({ href: `${base}/paginas`, label: nl ? "Pagina's" : "Pages", icon: <FileText {...ICON} />, segments: ["paginas"] });
  }

  return (
    <ModuleAdminShell title={nl ? "Header & pagina's" : "Header & pages"} navLabel={nl ? "Navigatie" : "Navigation"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
